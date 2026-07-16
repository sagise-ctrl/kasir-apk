package com.kasir.mlkitbarcode;

import android.Manifest;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.text.InputType;
import android.util.Log;
import android.view.Gravity;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.lifecycle.LifecycleOwner;

import com.google.android.gms.tasks.OnFailureListener;
import com.google.android.gms.tasks.OnSuccessListener;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.Barcode;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.common.InputImage;

import android.view.ViewGroup;
import android.view.WindowManager;

import androidx.camera.core.Preview;
import androidx.camera.core.Camera;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import java.util.List;

/**
 * Continuous scanning camera activity.
 *
 * Lifecycle model:
 *  - The activity stays open across many scans. Only the "Selesai" button
 *    (or a JS-initiated stopScan) ever finishes it.
 *  - The camera *preview* runs continuously the whole time.
 *  - The barcode *analyzer* (ImageAnalysis) is paused as soon as a barcode is
 *    read, and only resumed once JS tells us the result has been handled
 *    (showFeedback for found/not-found, or the duplicate-quantity dialog for
 *    an item already in the cart).
 */
public class CameraActivity extends AppCompatActivity {

    public static final String EXTRA_IS_BACKGROUND = "is_background";
    public static final String EXTRA_SCANNER_SESSION_ID = "session_id";
    public static final int CAMERA_PERMISSION_REQ = 73422;

    private static final String TAG = "CameraActivity";

    /** Safety net: if JS never answers a detected barcode, resume scanning anyway. */
    private static final long FEEDBACK_TIMEOUT_MS = 6000;

    private PreviewView previewView;
    private TextView statusTextView;
    private FrameLayout feedbackBanner;
    private TextView feedbackText;
    private ProcessCameraProvider cameraProvider;
    private ImageAnalysis imageAnalysis;
    private Camera camera;
    private boolean scanning = true;

    /** True while the analyzer is intentionally paused (result pending / dialog open). */
    private boolean analyzerPaused = false;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable pendingTimeout;

    private BarcodeScanner barcodeScanner;
    private String sessionId;

    /** Receiver for commands coming from JS: stop, show feedback, show duplicate prompt. */
    private BroadcastReceiver controlReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fullscreen-ish behavior without swapping to a non-AppCompat theme
        // (AppCompatActivity requires a Theme.AppCompat.* theme; the activity's
        // theme is set via AndroidManifest.xml instead of setTheme() here).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        sessionId = getIntent().getStringExtra(EXTRA_SCANNER_SESSION_ID);

        // Root scrim: semi-transparent so the app screen behind stays visible
        // and dimmed (translucent theme), instead of a fullscreen black camera.
        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        root.setBackgroundColor(0x99000000);

        // Centered column: [small camera box] + [status text below it]
        LinearLayout centerColumn = new LinearLayout(this);
        centerColumn.setOrientation(LinearLayout.VERTICAL);
        centerColumn.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams columnParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        columnParams.gravity = Gravity.CENTER;
        centerColumn.setLayoutParams(columnParams);

        int boxWidth = dp(300);
        int boxHeight = dp(220);
        int cornerRadius = dp(16);

        // Box container: fixed small size, rounded + clipped, black backdrop
        // so there is no white flash before the camera preview attaches.
        FrameLayout boxContainer = new FrameLayout(this);
        boxContainer.setLayoutParams(new LinearLayout.LayoutParams(boxWidth, boxHeight));
        GradientDrawable boxBackground = new GradientDrawable();
        boxBackground.setColor(Color.BLACK);
        boxBackground.setCornerRadius(cornerRadius);
        boxContainer.setBackground(boxBackground);
        boxContainer.setClipToOutline(true);
        boxContainer.setOutlineProvider(new android.view.ViewOutlineProvider() {
            @Override
            public void getOutline(android.view.View view, android.graphics.Outline outline) {
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), cornerRadius);
            }
        });

        // Create PreviewView, filling only the small box (not the full screen)
        previewView = new PreviewView(this);
        previewView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        boxContainer.addView(previewView);

        // White rounded border drawn on top of the preview, like the web viewfinder box
        android.view.View border = new android.view.View(this);
        border.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        GradientDrawable borderDrawable = new GradientDrawable();
        borderDrawable.setColor(Color.TRANSPARENT);
        borderDrawable.setStroke(dp(2), 0xB3FFFFFF);
        borderDrawable.setCornerRadius(cornerRadius);
        border.setBackground(borderDrawable);
        boxContainer.addView(border);

        // Feedback banner overlaid on top of the box (success/error), hidden by default.
        feedbackBanner = new FrameLayout(this);
        feedbackBanner.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        feedbackBanner.setVisibility(android.view.View.GONE);
        feedbackText = new TextView(this);
        FrameLayout.LayoutParams feedbackTextParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        feedbackTextParams.gravity = Gravity.CENTER;
        feedbackText.setLayoutParams(feedbackTextParams);
        feedbackText.setTextColor(Color.WHITE);
        feedbackText.setTextSize(15);
        feedbackText.setGravity(Gravity.CENTER);
        feedbackText.setPadding(dp(12), dp(8), dp(12), dp(8));
        feedbackBanner.addView(feedbackText);
        boxContainer.addView(feedbackBanner);

        centerColumn.addView(boxContainer);

        // Status text, below the box (not covering it)
        TextView statusText = new TextView(this);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        statusParams.topMargin = dp(12);
        statusText.setLayoutParams(statusParams);
        statusText.setText("Initializing camera...");
        statusText.setTextColor(0xFFFFFFFF);
        statusText.setGravity(Gravity.CENTER);
        statusText.setTag("status");
        centerColumn.addView(statusText);
        statusTextView = statusText;

        root.addView(centerColumn);

        // "Selesai" button, top-right of the screen — the ONLY action that closes
        // this activity and returns to the kasir page.
        TextView selesaiButton = new TextView(this);
        FrameLayout.LayoutParams selesaiParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                dp(36)
        );
        selesaiParams.gravity = Gravity.TOP | Gravity.END;
        selesaiParams.topMargin = dp(24);
        selesaiParams.rightMargin = dp(16);
        selesaiButton.setLayoutParams(selesaiParams);
        selesaiButton.setText("Selesai");
        selesaiButton.setTextColor(Color.WHITE);
        selesaiButton.setTextSize(13);
        selesaiButton.setGravity(Gravity.CENTER);
        selesaiButton.setPadding(dp(16), 0, dp(16), 0);
        GradientDrawable selesaiBg = new GradientDrawable();
        selesaiBg.setCornerRadius(dp(18));
        selesaiBg.setColor(0x80000000);
        selesaiButton.setBackground(selesaiBg);
        selesaiButton.setOnClickListener(v -> finish());
        root.addView(selesaiButton);

        setContentView(root);

        initScanner();

        // Register receiver to listen for commands from the plugin (JS side).
        registerControlReceiver();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            updateStatus("Requesting camera permission...");
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQ);
            return;
        }

        startCamera();
    }

    /** Disable the system back gesture/button as a way to close the scanner —
     *  "Selesai" is the only allowed close action. */
    @Override
    public void onBackPressed() {
        // Intentionally swallowed.
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return (int) (value * density + 0.5f);
    }

    private void updateStatus(String message) {
        if (statusTextView != null) {
            statusTextView.setText(message);
        }
        Log.d(TAG, message);
    }

    private void initScanner() {
        try {
            barcodeScanner = BarcodeScanning.getClient();
            Log.i(TAG, "ML Kit barcode scanner initialized");
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize ML Kit scanner", e);
            updateStatus("Error: " + e.getMessage());
        }
    }

    private void startCamera() {
        try {
            updateStatus("Starting camera...");

            ListenableFuture<ProcessCameraProvider> cameraProviderFuture =
                    ProcessCameraProvider.getInstance(this);

            cameraProviderFuture.addListener(() -> {
                try {
                    cameraProvider = cameraProviderFuture.get();
                    Log.i(TAG, "Camera provider obtained");
                    bindUseCases();
                } catch (Exception e) {
                    Log.e(TAG, "Camera provider error", e);
                    updateStatus("Camera error: " + e.getMessage());
                    Toast.makeText(this, "Failed to start camera: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            }, ContextCompat.getMainExecutor(this));
        } catch (Exception e) {
            Log.e(TAG, "startCamera failed", e);
            updateStatus("Camera error: " + e.getMessage());
        }
    }

    private void bindUseCases() {
        if (cameraProvider == null) {
            updateStatus("Camera provider is null");
            return;
        }

        try {
            Preview preview = new Preview.Builder().build();
            preview.setSurfaceProvider(previewView.getSurfaceProvider());

            imageAnalysis = new ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build();

            attachAnalyzer();

            CameraSelector cameraSelector = new CameraSelector.Builder()
                    .requireLensFacing(CameraSelector.LENS_FACING_BACK)
                    .build();

            cameraProvider.unbindAll();
            camera = cameraProvider.bindToLifecycle((LifecycleOwner) this, cameraSelector, preview, imageAnalysis);

            Log.i(TAG, "Camera bound to lifecycle successfully");
            updateStatus("Arahkan kamera ke barcode...");
        } catch (Exception e) {
            Log.e(TAG, "bindUseCases failed", e);
            updateStatus("Camera error: " + e.getMessage());
            Toast.makeText(this, "Failed to bind camera: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void attachAnalyzer() {
        if (imageAnalysis == null) return;
        imageAnalysis.setAnalyzer(ContextCompat.getMainExecutor(this), this::analyzeImage);
    }

    private void analyzeImage(@NonNull ImageProxy imageProxy) {
        // While paused (result pending / dialog open) or fully stopped, every
        // frame is dropped immediately — the preview keeps running, only the
        // barcode reading is skipped.
        if (!scanning || analyzerPaused) {
            imageProxy.close();
            return;
        }

        try {
            InputImage inputImage = InputImage.fromMediaImage(
                    imageProxy.getImage(),
                    imageProxy.getImageInfo().getRotationDegrees()
            );

            barcodeScanner.process(inputImage)
                    .addOnSuccessListener(new OnSuccessListener<List<Barcode>>() {
                        @Override
                        public void onSuccess(List<Barcode> barcodes) {
                            if (analyzerPaused || barcodes == null || barcodes.isEmpty()) {
                                imageProxy.close();
                                return;
                            }

                            for (Barcode b : barcodes) {
                                String raw = b.getRawValue();
                                if (raw != null && !raw.isEmpty()) {
                                    handleBarcodeDetected(raw);
                                    break; // only the first valid barcode in this frame matters
                                }
                            }

                            imageProxy.close();
                        }
                    })
                    .addOnFailureListener(new OnFailureListener() {
                        @Override
                        public void onFailure(@NonNull Exception e) {
                            Log.e(TAG, "Barcode analyze failed", e);
                            imageProxy.close();
                        }
                    });
        } catch (Exception e) {
            Log.e(TAG, "analyzeImage error", e);
            imageProxy.close();
        }
    }

    /**
     * Called on every barcode read while the analyzer is active. Pauses the
     * analyzer immediately (preview keeps running) and forwards the barcode
     * to JS, which will decide found/not-found/duplicate and tell us how to
     * respond via showFeedback() or showDuplicatePrompt(). A safety timeout
     * resumes scanning on its own if JS never answers.
     */
    private void handleBarcodeDetected(String barcode) {
        if (analyzerPaused) {
            return; // already handling a previous detection — ignore
        }
        pauseAnalyzer();

        Log.i(TAG, "Barcode detected, awaiting result from JS: " + barcode);
        updateStatus("Memproses...");

        vibrateFeedback(60);
        deliverBarcode(barcode);

        schedulePendingTimeout();
    }

    private void pauseAnalyzer() {
        analyzerPaused = true;
        if (imageAnalysis != null) {
            imageAnalysis.clearAnalyzer();
        }
    }

    private void resumeAnalyzer() {
        cancelPendingTimeout();
        analyzerPaused = false;
        hideFeedbackBanner();
        attachAnalyzer();
        updateStatus("Arahkan kamera ke barcode...");
    }

    private void schedulePendingTimeout() {
        cancelPendingTimeout();
        pendingTimeout = () -> {
            Log.w(TAG, "No response from JS within timeout, resuming analyzer");
            resumeAnalyzer();
        };
        mainHandler.postDelayed(pendingTimeout, FEEDBACK_TIMEOUT_MS);
    }

    private void cancelPendingTimeout() {
        if (pendingTimeout != null) {
            mainHandler.removeCallbacks(pendingTimeout);
            pendingTimeout = null;
        }
    }

    private void deliverBarcode(String barcode) {
        Intent i = new Intent(MlkitBarcodeScannerPlugin.ACTION_BARCODE_DETECTED);
        i.putExtra(MlkitBarcodeScannerPlugin.EXTRA_BARCODE, barcode);
        i.putExtra(MlkitBarcodeScannerPlugin.EXTRA_SESSION_ID, sessionId);
        LocalBroadcastManager.getInstance(this).sendBroadcast(i);
    }

    // ---------------------------------------------------------------
    // Feedback banner (found / not found) — shown for ~1s, then the
    // analyzer resumes automatically.
    // ---------------------------------------------------------------
    private void showFeedback(String type, String message, long durationMs) {
        if (feedbackBanner == null || feedbackText == null) {
            resumeAnalyzer();
            return;
        }

        boolean success = "success".equals(type);
        feedbackText.setText(message == null || message.isEmpty()
                ? (success ? "Berhasil ditambahkan" : "Produk tidak ditemukan")
                : message);
        feedbackBanner.setBackgroundColor(success ? 0xE6198754 : 0xE6DC3545);
        feedbackBanner.setVisibility(android.view.View.VISIBLE);

        if (success) {
            playBeepFeedback();
        } else {
            vibrateFeedback(150);
        }

        cancelPendingTimeout();
        long duration = durationMs > 0 ? durationMs : 1000;
        mainHandler.postDelayed(this::resumeAnalyzer, duration);
    }

    private void hideFeedbackBanner() {
        if (feedbackBanner != null) {
            feedbackBanner.setVisibility(android.view.View.GONE);
        }
    }

    // ---------------------------------------------------------------
    // Duplicate-in-cart dialog: barcode already in the cart, ask user
    // whether to add more and how many. Analyzer resumes once the
    // dialog is closed (Simpan or Batal), independent of JS handling
    // the resulting cart update.
    // ---------------------------------------------------------------
    private void showDuplicatePrompt(String barcode, String productName, int currentQty) {
        cancelPendingTimeout();

        try {
            final EditText qtyInput = new EditText(this);
            qtyInput.setInputType(InputType.TYPE_CLASS_NUMBER);
            qtyInput.setText("1");
            qtyInput.setSelectAllOnFocus(true);
            int pad = dp(20);
            qtyInput.setPadding(pad, dp(8), pad, 0);

            String name = (productName == null || productName.isEmpty()) ? barcode : productName;

            AlertDialog dialog = new AlertDialog.Builder(this)
                    .setTitle("Sudah ada di keranjang")
                    .setMessage(name + " sudah ada di keranjang (jumlah saat ini: " + currentQty + "). Tambah berapa?")
                    .setView(qtyInput)
                    .setPositiveButton("Simpan", (d, which) -> {
                        int qty;
                        try {
                            qty = Integer.parseInt(qtyInput.getText().toString().trim());
                        } catch (Exception e) {
                            qty = 1;
                        }
                        if (qty <= 0) qty = 1;
                        deliverDuplicateResolved(barcode, "add", qty);
                        resumeAnalyzer();
                    })
                    .setNegativeButton("Batal", (d, which) -> {
                        deliverDuplicateResolved(barcode, "cancel", 0);
                        resumeAnalyzer();
                    })
                    .setOnCancelListener(d -> {
                        deliverDuplicateResolved(barcode, "cancel", 0);
                        resumeAnalyzer();
                    })
                    .create();

            dialog.show();
        } catch (Exception e) {
            Log.e(TAG, "showDuplicatePrompt failed", e);
            resumeAnalyzer();
        }
    }

    private void deliverDuplicateResolved(String barcode, String action, int qty) {
        Intent i = new Intent(MlkitBarcodeScannerPlugin.ACTION_DUPLICATE_RESOLVED);
        i.putExtra(MlkitBarcodeScannerPlugin.EXTRA_BARCODE, barcode);
        i.putExtra(MlkitBarcodeScannerPlugin.EXTRA_RESOLVE_ACTION, action);
        i.putExtra(MlkitBarcodeScannerPlugin.EXTRA_QTY, qty);
        i.putExtra(MlkitBarcodeScannerPlugin.EXTRA_SESSION_ID, sessionId);
        LocalBroadcastManager.getInstance(this).sendBroadcast(i);
    }

    private void vibrateFeedback(long ms) {
        try {
            Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator == null || !vibrator.hasVibrator()) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(ms);
            }
        } catch (Exception e) {
            Log.w(TAG, "Vibrate feedback failed", e);
        }
    }

    private void playBeepFeedback() {
        try {
            int soundId = getResources().getIdentifier("beep_scan", "raw", getPackageName());
            if (soundId == 0) {
                Log.w(TAG, "beep_scan raw resource not found, skipping beep");
                return;
            }
            final MediaPlayer player = MediaPlayer.create(this, soundId);
            if (player == null) return;
            player.setOnCompletionListener(MediaPlayer::release);
            player.start();
        } catch (Exception e) {
            Log.w(TAG, "Beep feedback failed", e);
        }
    }

    // ---------------------------------------------------------------
    // Control receiver: commands sent from the plugin (JS side).
    // ---------------------------------------------------------------
    private void registerControlReceiver() {
        controlReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                String session = intent.getStringExtra(MlkitBarcodeScannerPlugin.EXTRA_SESSION_ID);
                if (session != null && !session.equals(sessionId)) return;

                if (MlkitBarcodeScannerPlugin.ACTION_STOP_SCAN.equals(action)) {
                    Log.d(TAG, "Stop scan received, finishing activity");
                    finish();
                } else if (MlkitBarcodeScannerPlugin.ACTION_SHOW_FEEDBACK.equals(action)) {
                    String type = intent.getStringExtra(MlkitBarcodeScannerPlugin.EXTRA_FEEDBACK_TYPE);
                    String message = intent.getStringExtra(MlkitBarcodeScannerPlugin.EXTRA_MESSAGE);
                    long duration = intent.getLongExtra(MlkitBarcodeScannerPlugin.EXTRA_DURATION_MS, 1000);
                    showFeedback(type, message, duration);
                } else if (MlkitBarcodeScannerPlugin.ACTION_SHOW_DUPLICATE_PROMPT.equals(action)) {
                    String barcode = intent.getStringExtra(MlkitBarcodeScannerPlugin.EXTRA_BARCODE);
                    String productName = intent.getStringExtra(MlkitBarcodeScannerPlugin.EXTRA_PRODUCT_NAME);
                    int currentQty = intent.getIntExtra(MlkitBarcodeScannerPlugin.EXTRA_CURRENT_QTY, 0);
                    showDuplicatePrompt(barcode, productName, currentQty);
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(MlkitBarcodeScannerPlugin.ACTION_STOP_SCAN);
        filter.addAction(MlkitBarcodeScannerPlugin.ACTION_SHOW_FEEDBACK);
        filter.addAction(MlkitBarcodeScannerPlugin.ACTION_SHOW_DUPLICATE_PROMPT);
        LocalBroadcastManager.getInstance(this).registerReceiver(controlReceiver, filter);
    }

    private void unregisterControlReceiver() {
        if (controlReceiver != null) {
            try {
                LocalBroadcastManager.getInstance(this).unregisterReceiver(controlReceiver);
            } catch (IllegalArgumentException ignored) {}
            controlReceiver = null;
        }
    }

    private void notifyScanClosed() {
        Intent i = new Intent(MlkitBarcodeScannerPlugin.ACTION_SCAN_CLOSED);
        i.putExtra(MlkitBarcodeScannerPlugin.EXTRA_SESSION_ID, sessionId);
        LocalBroadcastManager.getInstance(this).sendBroadcast(i);
    }

    @Override
    protected void onDestroy() {
        scanning = false;
        cancelPendingTimeout();
        unregisterControlReceiver();
        notifyScanClosed();
        try {
            if (cameraProvider != null) cameraProvider.unbindAll();
        } catch (Exception ignored) {}
        try {
            if (barcodeScanner != null) barcodeScanner.close();
        } catch (Exception ignored) {}
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQ) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.i(TAG, "Camera permission granted");
                startCamera();
            } else {
                Log.e(TAG, "Camera permission denied");
                updateStatus("Camera permission denied");
                Toast.makeText(this, "Camera permission denied", Toast.LENGTH_SHORT).show();
                finish();
            }
        }
    }
}

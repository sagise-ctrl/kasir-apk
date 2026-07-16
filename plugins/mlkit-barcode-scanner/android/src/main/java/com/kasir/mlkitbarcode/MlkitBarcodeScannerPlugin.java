package com.kasir.mlkitbarcode;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.util.Log;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "MlkitBarcodeScanner",
    permissions = {
        @Permission(
            alias = "camera",
            strings = { Manifest.permission.CAMERA }
        )
    }
)
public class MlkitBarcodeScannerPlugin extends Plugin {

    private static final String TAG = "MlkitBarcodeScanner";

    // Broadcast actions & extras shared with CameraActivity.
    // JS -> native:
    public static final String ACTION_STOP_SCAN             = "com.kasir.mlkitbarcode.STOP_SCAN";
    public static final String ACTION_SHOW_FEEDBACK         = "com.kasir.mlkitbarcode.SHOW_FEEDBACK";
    public static final String ACTION_SHOW_DUPLICATE_PROMPT = "com.kasir.mlkitbarcode.SHOW_DUPLICATE_PROMPT";
    // native -> JS:
    public static final String ACTION_BARCODE_DETECTED      = "com.kasir.mlkitbarcode.BARCODE_DETECTED";
    public static final String ACTION_DUPLICATE_RESOLVED    = "com.kasir.mlkitbarcode.DUPLICATE_RESOLVED";
    public static final String ACTION_SCAN_CLOSED           = "com.kasir.mlkitbarcode.SCAN_CLOSED";

    public static final String EXTRA_BARCODE        = "barcode";
    public static final String EXTRA_SESSION_ID     = "session_id";
    public static final String EXTRA_FEEDBACK_TYPE  = "feedback_type";
    public static final String EXTRA_MESSAGE        = "message";
    public static final String EXTRA_DURATION_MS    = "duration_ms";
    public static final String EXTRA_PRODUCT_NAME   = "product_name";
    public static final String EXTRA_CURRENT_QTY    = "current_qty";
    public static final String EXTRA_RESOLVE_ACTION = "resolve_action";
    public static final String EXTRA_QTY            = "qty";

    /** Unique session id per startScan call so we can match broadcasts. */
    private String currentSessionId = null;

    /** Broadcast receiver that forwards native events to JS listeners. */
    private BroadcastReceiver eventReceiver;

    /** Saved call for requestCameraPermission. */
    private PluginCall permissionCall = null;

    @Override
    public void load() {
        super.load();
        Log.i(TAG, "MlkitBarcodeScannerPlugin loaded");
    }

    // ---------------------------------------------------------------
    // requestCameraPermission  (Capacitor v8 pattern)
    // ---------------------------------------------------------------
    @PluginMethod
    public void requestCameraPermission(PluginCall call) {
        if (getPermissionState("camera") == com.getcapacitor.PermissionState.GRANTED) {
            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
            return;
        }

        permissionCall = call;
        requestPermissionForAlias("camera", call, "cameraPermissionCallback");
    }

    @PermissionCallback
    public void cameraPermissionCallback(PluginCall call) {
        boolean granted = (getPermissionState("camera") == com.getcapacitor.PermissionState.GRANTED);
        JSObject res = new JSObject();
        res.put("granted", granted);
        call.resolve(res);
        permissionCall = null;
    }

    // ---------------------------------------------------------------
    // startScan — opens CameraActivity for a continuous scanning session.
    // ---------------------------------------------------------------
    @PluginMethod
    public void startScan(PluginCall call) {
        try {
            if (getPermissionState("camera") != com.getcapacitor.PermissionState.GRANTED) {
                call.reject("Camera permission not granted. Call requestCameraPermission() first.");
                return;
            }

            currentSessionId = java.util.UUID.randomUUID().toString();

            registerEventReceiver();

            Intent intent = new Intent(getActivity(), CameraActivity.class);
            intent.putExtra(CameraActivity.EXTRA_SCANNER_SESSION_ID, currentSessionId);
            getActivity().startActivity(intent);

            Log.i(TAG, "CameraActivity launched, session=" + currentSessionId);

            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "startScan failed", e);
            call.reject(e.getMessage(), e);
        }
    }

    // ---------------------------------------------------------------
    // stopScan — the only way (besides the native "Selesai" button) to
    // close CameraActivity from outside.
    // ---------------------------------------------------------------
    @PluginMethod
    public void stopScan(PluginCall call) {
        try {
            Intent stopIntent = new Intent(ACTION_STOP_SCAN);
            stopIntent.putExtra(EXTRA_SESSION_ID, currentSessionId);
            LocalBroadcastManager.getInstance(getActivity()).sendBroadcast(stopIntent);

            unregisterEventReceiver();
            currentSessionId = null;

            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "stopScan failed", e);
            call.reject(e.getMessage(), e);
        }
    }

    // ---------------------------------------------------------------
    // showFeedback — tell CameraActivity to show a short success/error
    // banner, then auto-resume the analyzer once it's done.
    // ---------------------------------------------------------------
    @PluginMethod
    public void showFeedback(PluginCall call) {
        try {
            String type = call.getString("type", "success");
            String message = call.getString("message", "");
            int durationMs = call.getInt("durationMs", 1000);

            Intent intent = new Intent(ACTION_SHOW_FEEDBACK);
            intent.putExtra(EXTRA_SESSION_ID, currentSessionId);
            intent.putExtra(EXTRA_FEEDBACK_TYPE, type);
            intent.putExtra(EXTRA_MESSAGE, message);
            intent.putExtra(EXTRA_DURATION_MS, durationMs);
            LocalBroadcastManager.getInstance(getActivity()).sendBroadcast(intent);

            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "showFeedback failed", e);
            call.reject(e.getMessage(), e);
        }
    }

    // ---------------------------------------------------------------
    // showDuplicatePrompt — tell CameraActivity to show the "already in
    // cart, add how many?" dialog. Result comes back via 'duplicateResolved'.
    // ---------------------------------------------------------------
    @PluginMethod
    public void showDuplicatePrompt(PluginCall call) {
        try {
            String barcode = call.getString("barcode", "");
            String productName = call.getString("productName", "");
            int currentQty = call.getInt("currentQty", 0);

            Intent intent = new Intent(ACTION_SHOW_DUPLICATE_PROMPT);
            intent.putExtra(EXTRA_SESSION_ID, currentSessionId);
            intent.putExtra(EXTRA_BARCODE, barcode);
            intent.putExtra(EXTRA_PRODUCT_NAME, productName);
            intent.putExtra(EXTRA_CURRENT_QTY, currentQty);
            LocalBroadcastManager.getInstance(getActivity()).sendBroadcast(intent);

            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "showDuplicatePrompt failed", e);
            call.reject(e.getMessage(), e);
        }
    }

    // ---------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------

    private void registerEventReceiver() {
        unregisterEventReceiver(); // ensure no duplicate

        eventReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                String session = intent.getStringExtra(EXTRA_SESSION_ID);
                if (currentSessionId != null && !currentSessionId.equals(session)) return;

                if (ACTION_BARCODE_DETECTED.equals(action)) {
                    String barcode = intent.getStringExtra(EXTRA_BARCODE);
                    if (barcode == null || barcode.isEmpty()) return;
                    Log.d(TAG, "Barcode received: " + barcode + " session=" + session);
                    JSObject payload = new JSObject();
                    payload.put("barcode", barcode);
                    notifyListeners("barcodeDetected", payload);
                } else if (ACTION_DUPLICATE_RESOLVED.equals(action)) {
                    JSObject payload = new JSObject();
                    payload.put("barcode", intent.getStringExtra(EXTRA_BARCODE));
                    payload.put("action", intent.getStringExtra(EXTRA_RESOLVE_ACTION));
                    payload.put("qty", intent.getIntExtra(EXTRA_QTY, 0));
                    notifyListeners("duplicateResolved", payload);
                } else if (ACTION_SCAN_CLOSED.equals(action)) {
                    Log.d(TAG, "Scan closed (native), session=" + session);
                    notifyListeners("scanClosed", new JSObject());
                    // Activity is gone — clean up so a stray late broadcast can't leak through.
                    unregisterEventReceiver();
                    currentSessionId = null;
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_BARCODE_DETECTED);
        filter.addAction(ACTION_DUPLICATE_RESOLVED);
        filter.addAction(ACTION_SCAN_CLOSED);
        LocalBroadcastManager.getInstance(getActivity()).registerReceiver(eventReceiver, filter);

        Log.i(TAG, "Event receiver registered");
    }

    private void unregisterEventReceiver() {
        if (eventReceiver != null) {
            try {
                LocalBroadcastManager.getInstance(getActivity())
                        .unregisterReceiver(eventReceiver);
            } catch (IllegalArgumentException ignored) {}
            eventReceiver = null;
            Log.i(TAG, "Event receiver unregistered");
        }
    }

    @Override
    protected void handleOnDestroy() {
        unregisterEventReceiver();
        super.handleOnDestroy();
    }
}

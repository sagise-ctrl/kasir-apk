package com.kasir.thermalprinter;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

/**
 * Plugin Capacitor native untuk Bluetooth ESC/POS thermal printer.
 *
 * Arsitektur mengikuti MlkitBarcodeScannerPlugin:
 *   - JS memanggil plugin method (scanPrinters, connect, printReceipt, dll.)
 *   - Plugin menjalankan operasi Bluetooth di background thread
 *   - Hasil dikembalikan via call.resolve()/call.reject()
 *   - Perubahan status dikirim via notifyListeners("connectionChanged")
 *
 * Koneksi menggunakan RFCOMM socket (SPP profile — UUID 00001101-...).
 * Printer default disimpan di SharedPreferences agar bisa auto-reconnect.
 *
 * Tidak ada library pihak ketiga — murni Android Bluetooth API + ESC/POS
 * yang dibangun sendiri lewat EscPosBuilder.
 */
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = {
        // API < 31 (Android < 12): izin normal, tidak butuh runtime request
        @Permission(alias = "bluetooth",
                    strings = { Manifest.permission.BLUETOOTH }),
        // API >= 31 (Android 12+): wajib untuk baca paired devices & connect
        @Permission(alias = "bluetoothConnect",
                    strings = { "android.permission.BLUETOOTH_CONNECT" }),
    }
)
public class ThermalPrinterPlugin extends Plugin {

    private static final String TAG  = "ThermalPrinter";
    private static final UUID   SPP  = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String PREF = "ThermalPrinterPrefs";

    // ── Koneksi aktif ─────────────────────────────────────────────────────────
    private BluetoothSocket socket;
    private OutputStream    outputStream;
    private String          connectedAddress;
    private String          connectedName;

    // ── Konfigurasi ───────────────────────────────────────────────────────────
    private int paperWidthMm = 58;

    // ─────────────────────────────────────────────────────────────────────────
    @Override
    public void load() {
        super.load();
        SharedPreferences p = prefs();
        paperWidthMm = p.getInt("paperWidthMm", 58);
        Log.i(TAG, "loaded — paperWidth=" + paperWidthMm + "mm");
    }

    // ── Izin Bluetooth ────────────────────────────────────────────────────────

    /**
     * Minta izin Bluetooth runtime yang sesuai dengan versi Android.
     * Android 12+ → BLUETOOTH_CONNECT
     * Android <12 → BLUETOOTH (biasanya sudah granted karena normal permission)
     */
    @PluginMethod
    public void requestBluetoothPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) {
            if (isGranted("bluetoothConnect")) {
                ok(call); return;
            }
            requestPermissionForAlias("bluetoothConnect", call, "btPermCallback");
        } else {
            if (isGranted("bluetooth")) {
                ok(call); return;
            }
            requestPermissionForAlias("bluetooth", call, "btPermCallback");
        }
    }

    @PermissionCallback
    public void btPermCallback(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT >= 31
            ? isGranted("bluetoothConnect")
            : isGranted("bluetooth");
        JSObject r = new JSObject();
        r.put("granted", granted);
        call.resolve(r);
    }

    // ── Scan printer (paired devices) ─────────────────────────────────────────

    /**
     * Kembalikan semua printer Bluetooth yang sudah dipasangkan (bonded) di
     * sistem Android. Tidak memerlukan active scan — pengguna harus melakukan
     * pairing terlebih dahulu dari Pengaturan > Bluetooth Android.
     *
     * Tidak butuh BLUETOOTH_SCAN / ACCESS_FINE_LOCATION karena hanya membaca
     * daftar paired devices yang sudah ada.
     */
    @PluginMethod
    public void scanPrinters(PluginCall call) {
        try {
            BluetoothAdapter adapter = adapter();
            if (adapter == null) { call.reject("Bluetooth tidak tersedia"); return; }
            if (!adapter.isEnabled()) { call.reject("Bluetooth tidak aktif"); return; }

            JSArray list = new JSArray();
            for (BluetoothDevice dev : adapter.getBondedDevices()) {
                JSObject d = new JSObject();
                d.put("address", dev.getAddress());
                d.put("name",    dev.getName() != null ? dev.getName() : dev.getAddress());
                d.put("bonded",  true);
                list.put(d);
            }

            JSObject res = new JSObject();
            res.put("devices", list);
            call.resolve(res);

        } catch (SecurityException e) {
            call.reject("Izin Bluetooth diperlukan: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "scanPrinters", e);
            call.reject("Gagal scan printer: " + e.getMessage());
        }
    }

    // ── Connect ───────────────────────────────────────────────────────────────

    /**
     * Hubungkan ke printer via RFCOMM (SPP UUID).
     * Operasi blocking dijalankan di background thread.
     * Menyimpan alamat sebagai printer default secara otomatis.
     */
    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address", "").trim();
        String name    = call.getString("name",    address);
        if (address.isEmpty()) { call.reject("address wajib diisi"); return; }

        closeSocket(); // putuskan koneksi lama jika ada

        new Thread(() -> {
            try {
                BluetoothAdapter ba = adapter();
                if (ba == null)        { call.reject("Bluetooth tidak tersedia"); return; }
                if (!ba.isEnabled())   { call.reject("Bluetooth tidak aktif");    return; }

                BluetoothDevice dev = ba.getRemoteDevice(address);
                BluetoothSocket s   = dev.createRfcommSocketToServiceRecord(SPP);

                // cancelDiscovery wajib sebelum connect agar tidak terjadi
                // bottleneck bandwidth Bluetooth yang menyebabkan koneksi gagal.
                try { ba.cancelDiscovery(); } catch (SecurityException ignored) {}

                s.connect(); // blocking — timeout ~12 detik

                socket           = s;
                outputStream     = s.getOutputStream();
                connectedAddress = address;
                connectedName    = name;

                // Simpan sebagai default
                prefs().edit()
                    .putString("defaultAddress", address)
                    .putString("defaultName",    name)
                    .apply();

                Log.i(TAG, "connected: " + name + " [" + address + "]");
                fireEvent(true, address, name);
                call.resolve();

            } catch (SecurityException e) {
                call.reject("Izin BLUETOOTH_CONNECT diperlukan");
            } catch (IOException e) {
                Log.e(TAG, "connect IO", e);
                closeSocket();
                call.reject("Gagal terhubung: " + e.getMessage());
            } catch (Exception e) {
                Log.e(TAG, "connect err", e);
                closeSocket();
                call.reject("Error koneksi: " + e.getMessage());
            }
        }).start();
    }

    // ── Disconnect ────────────────────────────────────────────────────────────

    @PluginMethod
    public void disconnect(PluginCall call) {
        String addr = connectedAddress != null ? connectedAddress : "";
        String name = connectedName    != null ? connectedName    : "";
        closeSocket();
        Log.i(TAG, "disconnected: " + name);
        fireEvent(false, addr, name);
        call.resolve();
    }

    // ── Status ────────────────────────────────────────────────────────────────

    @PluginMethod
    public void getStatus(PluginCall call) {
        boolean live = socket != null && socket.isConnected();
        SharedPreferences p = prefs();
        JSObject r = new JSObject();
        r.put("connected",      live);
        r.put("address",        live ? connectedAddress                  : "");
        r.put("name",           live ? connectedName                     : "");
        r.put("paperWidthMm",   paperWidthMm);
        r.put("defaultAddress", p.getString("defaultAddress", ""));
        r.put("defaultName",    p.getString("defaultName",    ""));
        call.resolve(r);
    }

    // ── Paper width ───────────────────────────────────────────────────────────

    @PluginMethod
    public void setPaperWidth(PluginCall call) {
        int mm = call.getInt("mm", 58);
        if (mm != 58 && mm != 80) { call.reject("mm harus 58 atau 80"); return; }
        paperWidthMm = mm;
        prefs().edit().putInt("paperWidthMm", mm).apply();
        call.resolve();
    }

    // ── Auto-reconnect ────────────────────────────────────────────────────────

    /**
     * Coba hubungkan kembali ke printer default yang tersimpan.
     * Tidak pernah reject — selalu resolve dengan { connected: bool }.
     * Dipanggil saat aplikasi dibuka agar printer siap lebih cepat.
     */
    @PluginMethod
    public void autoConnect(PluginCall call) {
        SharedPreferences p = prefs();
        String savedAddr = p.getString("defaultAddress", "");
        String savedName = p.getString("defaultName",    "");

        if (savedAddr.isEmpty()) {
            call.resolve(noConn()); return;
        }
        // Sudah terhubung ke printer yang sama
        if (socket != null && socket.isConnected() && savedAddr.equals(connectedAddress)) {
            JSObject r = new JSObject(); r.put("connected", true); call.resolve(r); return;
        }

        new Thread(() -> {
            try {
                BluetoothAdapter ba = adapter();
                if (ba == null || !ba.isEnabled()) { call.resolve(noConn()); return; }

                closeSocket();
                BluetoothDevice dev = ba.getRemoteDevice(savedAddr);
                BluetoothSocket s   = dev.createRfcommSocketToServiceRecord(SPP);
                try { ba.cancelDiscovery(); } catch (SecurityException ignored) {}
                s.connect();

                socket           = s;
                outputStream     = s.getOutputStream();
                connectedAddress = savedAddr;
                connectedName    = savedName;

                Log.i(TAG, "auto-reconnected: " + savedName);
                fireEvent(true, savedAddr, savedName);
                JSObject r = new JSObject(); r.put("connected", true); call.resolve(r);

            } catch (Exception e) {
                Log.w(TAG, "autoConnect failed: " + e.getMessage());
                closeSocket();
                call.resolve(noConn());
            }
        }).start();
    }

    // ── Test print ────────────────────────────────────────────────────────────

    @PluginMethod
    public void printTest(PluginCall call) {
        if (!assertConnected(call)) return;

        new Thread(() -> {
            try {
                EscPosBuilder b = new EscPosBuilder(paperWidthMm);
                b.init()
                 .alignCenter().boldOn().doubleSizeOn()
                 .text("TOKO AN\n")
                 .doubleSizeOff().boldOff()
                 .text("=== Test Print ===\n")
                 .divider()
                 .alignLeft()
                 .text("Printer  : " + safe(connectedName)    + "\n")
                 .text("Alamat   : " + safe(connectedAddress) + "\n")
                 .text("Paper    : " + paperWidthMm + "mm\n")
                 .text("Kolom    : " + b.getCols() + " char\n")
                 .divider()
                 .alignCenter()
                 .text("0123456789\n")
                 .text("ABCDEFGHIJKLMNOPQRSTUVWXYZ\n")
                 .divider()
                 .boldOn().text("Printer siap digunakan!\n").boldOff()
                 .feedAndCut();

                sendBytes(b.build());
                call.resolve();

            } catch (Exception e) {
                Log.e(TAG, "printTest", e);
                onPrintError(call, e);
            }
        }).start();
    }

    // ── Print receipt ─────────────────────────────────────────────────────────

    /**
     * Cetak struk transaksi ESC/POS.
     *
     * Format struk (58mm, 32 kolom):
     *   [Nama Toko — center, bold, double]
     *   Kasir: ...
     *   --------------------------------
     *   dd/MM/yyyy HH:mm
     *   ID: TRX-...
     *   --------------------------------
     *   Nama Produk
     *     2 x 15.000         30.000
     *   --------------------------------
     *   TOTAL               50.000
     *   ================================
     *   Tunai               60.000
     *   Kembali             10.000
     *   ================================
     *   Terima kasih!
     */
    @PluginMethod
    public void printReceipt(PluginCall call) {
        if (!assertConnected(call)) return;

        new Thread(() -> {
            try {
                // ── Ambil data dari JS ────────────────────────────────────────
                String  storeName   = call.getString("storeName",    "TOKO");
                String  cashier     = call.getString("cashierName",  "Kasir");
                long    subtotal    = longVal(call.getObject("subtotal",  null), call.getString("subtotal",  "0"));
                long    diskon      = longVal(call.getObject("diskon",    null), call.getString("diskon",    "0"));
                long    total       = longVal(call.getObject("total",     null), call.getString("total",     "0"));
                long    payment     = longVal(call.getObject("payment",   null), call.getString("payment",   "0"));
                long    change      = longVal(call.getObject("change",    null), call.getString("change",    "0"));
                String  payMethod   = call.getString("paymentMethod", "Tunai");
                String  transId     = call.getString("transactionId", "");
                JSArray items       = call.getArray("items", new JSArray());

                EscPosBuilder b = new EscPosBuilder(paperWidthMm);

                // ── Header ────────────────────────────────────────────────────
                b.init()
                 .alignCenter().boldOn().doubleSizeOn()
                 .text(storeName + "\n")
                 .doubleSizeOff().boldOff()
                 .text("Kasir: " + cashier + "\n")
                 .divider()
                 .alignLeft();

                // Tanggal & ID transaksi
                String tgl = new SimpleDateFormat("dd/MM/yyyy HH:mm",
                                 new Locale("id", "ID")).format(new Date());
                b.text(tgl + "\n");
                if (!transId.isEmpty()) b.text("ID: " + transId + "\n");
                b.divider();

                // ── Items ─────────────────────────────────────────────────────
                for (int i = 0; i < items.length(); i++) {
                    JSObject item = items.getJSObject(i);
                    if (item == null) continue;

                    String itemName = item.getString("name", "");
                    int    qty      = item.getInteger("qty",      0);
                    long   price    = getLong(item, "price",    0L);
                    long   sub      = getLong(item, "subtotal", 0L);

                    b.text(itemName + "\n");
                    b.twoColumn("  " + qty + " x " + rp(price), rp(sub));
                }

                // ── Subtotal + diskon + total ─────────────────────────────────
                b.divider();
                if (diskon > 0) {
                    b.twoColumn("Diskon", "- " + rp(diskon));
                }
                b.boldOn()
                 .twoColumn("TOTAL", rp(total))
                 .boldOff()
                 .doubleDivider();

                // ── Pembayaran ────────────────────────────────────────────────
                boolean isCash = "cash".equalsIgnoreCase(payMethod)
                              || "tunai".equalsIgnoreCase(payMethod);
                if (isCash) {
                    b.twoColumn("Tunai",   rp(payment));
                    b.twoColumn("Kembali", rp(change));
                } else {
                    b.twoColumn("Bayar via", payMethod);
                }

                // ── Footer ────────────────────────────────────────────────────
                b.doubleDivider()
                 .alignCenter()
                 .text("Terima kasih!\n")
                 .text("Selamat berbelanja :)\n")
                 .feedAndCut();

                sendBytes(b.build());
                call.resolve();

            } catch (Exception e) {
                Log.e(TAG, "printReceipt", e);
                onPrintError(call, e);
            }
        }).start();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private boolean assertConnected(PluginCall call) {
        if (socket == null || !socket.isConnected()) {
            call.reject("Printer tidak terhubung. Hubungkan printer terlebih dahulu.");
            return false;
        }
        return true;
    }

    private void sendBytes(byte[] data) throws IOException {
        if (outputStream == null) throw new IOException("Output stream null");
        outputStream.write(data);
        outputStream.flush();
    }

    private void onPrintError(PluginCall call, Exception e) {
        if (e instanceof IOException) {
            String addr = connectedAddress != null ? connectedAddress : "";
            String name = connectedName    != null ? connectedName    : "";
            closeSocket();
            fireEvent(false, addr, name);
        }
        call.reject("Gagal mencetak: " + e.getMessage());
    }

    private synchronized void closeSocket() {
        connectedAddress = null;
        connectedName    = null;
        if (outputStream != null) {
            try { outputStream.close(); } catch (IOException ignored) {}
            outputStream = null;
        }
        if (socket != null) {
            try { socket.close(); } catch (IOException ignored) {}
            socket = null;
        }
    }

    private void fireEvent(boolean connected, String address, String name) {
        JSObject p = new JSObject();
        p.put("connected",      connected);
        p.put("address",        address != null ? address : "");
        p.put("name",           name    != null ? name    : "");
        p.put("paperWidthMm",   paperWidthMm);
        p.put("defaultAddress", prefs().getString("defaultAddress", ""));
        p.put("defaultName",    prefs().getString("defaultName",    ""));
        notifyListeners("connectionChanged", p);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREF, 0);
    }

    private BluetoothAdapter adapter() {
        return BluetoothAdapter.getDefaultAdapter();
    }

    private boolean isGranted(String alias) {
        return getPermissionState(alias) == com.getcapacitor.PermissionState.GRANTED;
    }

    /** Resolve call dengan { granted: true }. */
    private static void ok(PluginCall call) {
        JSObject r = new JSObject(); r.put("granted", true); call.resolve(r);
    }

    /** JSObject { connected: false } untuk autoConnect. */
    private static JSObject noConn() {
        JSObject r = new JSObject(); r.put("connected", false); return r;
    }

    private static String safe(String s) { return s != null ? s : "-"; }

    /**
     * Format angka rupiah tanpa simbol "Rp" agar hemat kolom.
     * Contoh: 50000 → "50.000"
     */
    private static String rp(long amount) {
        return NumberFormat.getInstance(new Locale("id", "ID")).format(amount);
    }

    /**
     * Ambil long dari JSObject dengan penanganan tipe Double/Integer/String.
     */
    private static long getLong(JSObject obj, String key, long def) {
        try {
            Object v = obj.get(key);
            if (v instanceof Number) return ((Number) v).longValue();
            if (v instanceof String) return Long.parseLong((String) v);
        } catch (Exception ignored) {}
        return def;
    }

    /**
     * Helper untuk membaca nilai long dari call yang bisa datang sebagai
     * number atau string dari JS.
     */
    private static long longVal(Object ignored, String strVal) {
        try { return Long.parseLong(strVal != null ? strVal : "0"); }
        catch (NumberFormatException e) { return 0L; }
    }
}

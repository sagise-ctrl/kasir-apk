import { useBarcodeScanner } from "./BarcodeScanner";

/**
 * Tombol "Scan Barcode" untuk mode SINGLE SCAN — dipakai di halaman Produk,
 * halaman Inventori, dan form Tambah Produk. Berbeda dari scanner kasir
 * (continuous, lihat CariProduk.jsx): di sini kamera dibuka, satu barcode
 * dibaca, kamera langsung ditutup, lalu hasilnya diteruskan lewat
 * `onScanned`. Memakai implementasi native ML Kit yang sama
 * (useBarcodeScanner / CameraActivity) — hanya alur setelah barcode
 * terbaca yang berbeda (mode: "single").
 */
export function ScanBarcodeButton({
  onScanned,
  className = "",
  disabled = false,
}) {
  const { videoRef, isScanning, isNative, error, startScanning, stopScanning } =
    useBarcodeScanner({
      mode: "single",
      onBarcodeDetected: async (barcode) => {
        // Web (ZXing): sama seperti sebelumnya, kamera harus ditutup manual.
        await stopScanning();
        onScanned?.(barcode);
      },
      onNativeBarcodeDetected: async (barcode) => {
        // Android native: CameraActivity sudah menutup diri sendiri untuk
        // mode "single" (lihat handleBarcodeDetected di CameraActivity.java).
        onScanned?.(barcode);
      },
    });

  async function handleClick() {
    if (disabled) return;
    if (isScanning) {
      await stopScanning();
    } else {
      startScanning().catch((err) => {
        console.error("Scan error:", err);
      });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title="Scan barcode"
        className={`px-3 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all shrink-0 ${
          disabled
            ? "opacity-50 cursor-not-allowed bg-white border-gray-200 text-gray-400"
            : isScanning
              ? "bg-indigo-600 border-indigo-600 text-white"
              : "bg-white border-gray-200 text-gray-500 hover:border-indigo-400"
        } ${className}`}
      >
        📷 Scan
      </button>

      {error && (
        <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-1.5 mt-1">
          {error}
        </div>
      )}

      {/* Overlay kamera — hanya untuk fallback web (ZXing); di Android native
          satu-satunya preview adalah CameraActivity native ML Kit. */}
      {isScanning && !isNative && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => stopScanning()}
        >
          <div
            className="relative rounded-2xl overflow-hidden bg-black shadow-lg max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              ref={videoRef}
              className="w-full max-h-72 object-cover"
              autoPlay
              playsInline
              muted
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-52 h-32 border-2 border-white/70 rounded-lg" />
            </div>
            <button
              onClick={() => stopScanning()}
              className="absolute top-3 right-3 bg-black/50 text-white rounded-full
                         w-8 h-8 flex items-center justify-center text-sm hover:bg-black/70"
            >
              ✕
            </button>
            <div className="absolute bottom-3 left-0 right-0 text-center text-white/80 text-xs">
              Arahkan kamera ke barcode
            </div>
          </div>
        </div>
      )}
    </>
  );
}

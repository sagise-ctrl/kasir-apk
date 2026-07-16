import { registerPlugin } from "@capacitor/core";

export type BarcodeScanOptions = {
  /**
   * Array nama format (mis. "EAN_13", "EAN_8", "UPCA", "UPCE", "CODE_128")
   * Jika kosong/undefined: plugin akan pakai default format retail.
   */
  formats?: string[];
};

export type CameraPermissionResult = {
  granted: boolean;
};

export type BarcodeScanResult = {
  barcode: string;
};

export type FeedbackOptions = {
  /** "success" untuk produk ditemukan & masuk keranjang, "error" untuk tidak ditemukan/gagal. */
  type: "success" | "error";
  message: string;
  /** Durasi tampil banner dalam ms, default 1000. */
  durationMs?: number;
};

export type DuplicatePromptOptions = {
  barcode: string;
  productName: string;
  currentQty: number;
};

export type DuplicateResolvedResult = {
  barcode: string;
  action: "add" | "cancel";
  qty: number;
};

export interface MlkitBarcodeScannerPlugin {
  /**
   * Mulai continuous scanning kamera native menggunakan ML Kit. Activity
   * tetap terbuka dan mengirim event 'barcodeDetected' untuk setiap barcode
   * yang terbaca, sampai stopScan() dipanggil atau tombol "Selesai" ditekan.
   * Resolves ketika activity kamera sudah dimulai.
   */
  startScan(options?: BarcodeScanOptions): Promise<void>;

  /** Hentikan scanning, tutup CameraActivity & release camera. */
  stopScan(): Promise<void>;

  /** Minta permission CAMERA (runtime). */
  requestCameraPermission(): Promise<CameraPermissionResult>;

  /**
   * Tampilkan banner sukses/gagal singkat (~1 detik) di atas preview kamera.
   * Analyzer barcode tetap pause selama banner tampil, lalu otomatis resume.
   */
  showFeedback(options: FeedbackOptions): Promise<void>;

  /**
   * Tampilkan dialog "produk sudah ada di keranjang, tambah berapa?".
   * Analyzer tetap pause sampai dialog selesai (Simpan/Batal), lalu resume
   * otomatis. Hasil pilihan user dikirim lewat event 'duplicateResolved'.
   */
  showDuplicatePrompt(options: DuplicatePromptOptions): Promise<void>;

  /**
   * Event ketika barcode terdeteksi (bisa terjadi berkali-kali dalam satu
   * sesi scan karena mode continuous).
   * Payload: { barcode: string }
   */
  addListener(
    eventName: "barcodeDetected",
    listener: (payload: BarcodeScanResult) => void,
  ): Promise<{ remove: () => void }>;

  /**
   * Event setelah dialog duplicate (barcode sudah di keranjang) selesai.
   */
  addListener(
    eventName: "duplicateResolved",
    listener: (payload: DuplicateResolvedResult) => void,
  ): Promise<{ remove: () => void }>;

  /**
   * Event ketika CameraActivity ditutup dari sisi native (tombol "Selesai").
   */
  addListener(
    eventName: "scanClosed",
    listener: () => void,
  ): Promise<{ remove: () => void }>;
}

export const MlkitBarcodeScanner = registerPlugin<MlkitBarcodeScannerPlugin>(
  "MlkitBarcodeScanner",
);

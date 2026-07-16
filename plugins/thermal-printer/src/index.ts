import { registerPlugin } from "@capacitor/core";

// ─── Device ──────────────────────────────────────────────────────────────────

export type PrinterDevice = {
  /** Alamat MAC Bluetooth, mis. "00:11:22:33:44:55". */
  address: string;
  /** Nama perangkat yang ditampilkan. */
  name: string;
  /** true jika perangkat sudah dipasangkan (bonded) di sistem Android. */
  bonded: boolean;
};

// ─── Status ───────────────────────────────────────────────────────────────────

export type PrinterStatus = {
  connected: boolean;
  address: string;
  name: string;
  paperWidthMm: 58 | 80;
  /** Alamat printer default yang tersimpan (bisa berbeda jika sedang tidak terhubung). */
  defaultAddress: string;
  defaultName: string;
};

// ─── Receipt ─────────────────────────────────────────────────────────────────

export type ReceiptItem = {
  name: string;
  qty: number;
  /** Harga satuan dalam rupiah. */
  price: number;
  subtotal: number;
};

export type ReceiptData = {
  storeName: string;
  cashierName: string;
  items: ReceiptItem[];
  subtotal: number;
  diskon: number;
  total: number;
  payment: number;
  change: number;
  /** "Tunai", "Tempo", "QRIS", dll. */
  paymentMethod: string;
  transactionId?: string;
  paperWidthMm?: 58 | 80;
};

// ─── Options ─────────────────────────────────────────────────────────────────

export type ConnectOptions = {
  address: string;
  name?: string;
};

export type BluetoothPermissionResult = {
  granted: boolean;
};

// ─── Plugin interface ─────────────────────────────────────────────────────────

export interface ThermalPrinterPlugin {
  /**
   * Minta izin Bluetooth runtime (BLUETOOTH_CONNECT di API 31+,
   * BLUETOOTH di API <31). Harus dipanggil sebelum operasi Bluetooth lain.
   */
  requestBluetoothPermission(): Promise<BluetoothPermissionResult>;

  /**
   * Kembalikan daftar printer Bluetooth yang sudah dipasangkan (bonded)
   * di sistem Android. Pasangkan printer dulu lewat Pengaturan > Bluetooth
   * sebelum menggunakan metode ini.
   */
  scanPrinters(): Promise<{ devices: PrinterDevice[] }>;

  /**
   * Hubungkan ke printer via RFCOMM (SPP profile).
   * Secara otomatis menyimpan printer ini sebagai printer default.
   * Resolve setelah koneksi berhasil, reject jika gagal.
   */
  connect(options: ConnectOptions): Promise<void>;

  /** Putuskan koneksi dari printer yang sedang terhubung. */
  disconnect(): Promise<void>;

  /** Kembalikan status koneksi saat ini beserta printer default tersimpan. */
  getStatus(): Promise<PrinterStatus>;

  /**
   * Atur lebar kertas. Wajib diset sesuai jenis printer fisik.
   * 58mm ≈ 32 karakter/baris, 80mm ≈ 48 karakter/baris.
   */
  setPaperWidth(options: { mm: 58 | 80 }): Promise<void>;

  /**
   * Cetak halaman test sederhana untuk memverifikasi koneksi dan lebar kertas.
   * Printer harus sudah terhubung.
   */
  printTest(): Promise<void>;

  /**
   * Cetak struk transaksi ESC/POS.
   * Printer harus sudah terhubung.
   */
  printReceipt(data: ReceiptData): Promise<void>;

  /**
   * Coba hubungkan kembali ke printer default yang tersimpan.
   * Tidak melempar error jika gagal — kembalikan { connected: false }.
   * Berguna untuk auto-reconnect saat aplikasi dibuka.
   */
  autoConnect(): Promise<{ connected: boolean }>;

  /**
   * Event dikirim setiap kali status koneksi berubah
   * (connected / disconnected, termasuk saat koneksi terputus karena error cetak).
   */
  addListener(
    eventName: "connectionChanged",
    listener: (payload: PrinterStatus) => void,
  ): Promise<{ remove: () => void }>;
}

export const ThermalPrinter = registerPlugin<ThermalPrinterPlugin>(
  "ThermalPrinter",
);

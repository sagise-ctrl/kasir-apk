/**
 * Re-export lengkap dari plugin lokal thermal-printer.
 * Semua komponen React mengimpor dari sini, bukan dari plugin langsung.
 */
export {
  ThermalPrinter,
  type ThermalPrinterPlugin,
  type PrinterDevice,
  type PrinterStatus,
  type ReceiptData,
  type ReceiptItem,
  type ConnectOptions,
  type BluetoothPermissionResult,
} from "../../plugins/thermal-printer/src/index";

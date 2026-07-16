/**
 * printerService.js
 *
 * Lapisan abstraksi antara React dan plugin native ThermalPrinter.
 * Business logic React tidak pernah menyentuh plugin langsung —
 * semua lewat sini.
 *
 * Ekspor:
 *   usePrinter()          — hook lengkap untuk halaman Pengaturan Printer
 *   printReceiptDirect()  — fungsi standalone untuk ModalBayar (tanpa state)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { ThermalPrinter } from "../native/thermal-printer";

// ─── Deteksi platform ─────────────────────────────────────────────────────────

const isNative = () => Capacitor.isNativePlatform?.() === true;

// ─── Standalone helpers (dapat dipanggil tanpa hook) ─────────────────────────

/**
 * Minta izin Bluetooth runtime.
 * Aman dipanggil berulang kali — langsung resolve jika sudah diberikan.
 */
export async function requestBluetoothPermission() {
  if (!isNative()) return { granted: false, reason: "web" };
  const res = await ThermalPrinter.requestBluetoothPermission();
  return res;
}

/**
 * Cetak struk transaksi langsung tanpa state hook.
 * Dipakai oleh ModalBayar setelah transaksi berhasil.
 *
 * @param {import("../native/thermal-printer").ReceiptData} data
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function printReceiptDirect(data) {
  if (!isNative()) {
    console.warn(
      "[Printer] printReceiptDirect: bukan platform native, print dilewati",
    );
    return { ok: false, error: "Hanya tersedia di Android" };
  }
  try {
    await ThermalPrinter.printReceipt(data);
    return { ok: true };
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("[Printer] printReceiptDirect error:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Ambil status koneksi printer saat ini.
 * @returns {Promise<import("../native/thermal-printer").PrinterStatus | null>}
 */
export async function getPrinterStatus() {
  if (!isNative()) return null;
  try {
    return await ThermalPrinter.getStatus();
  } catch {
    return null;
  }
}

// ─── Hook usePrinter ─────────────────────────────────────────────────────────

/**
 * Hook lengkap untuk halaman Pengaturan Printer.
 *
 * State yang diekspos:
 *   connected      — boolean, apakah printer sedang terhubung
 *   printerName    — nama printer yang terhubung
 *   printerAddress — alamat MAC printer yang terhubung
 *   defaultName    — nama printer default tersimpan
 *   defaultAddress — alamat printer default tersimpan
 *   paperWidthMm   — 58 | 80
 *   printers       — daftar printer dari scanPrinters()
 *   scanning       — sedang melakukan scan printer
 *   connecting     — sedang menghubungkan
 *   printing       — sedang mencetak
 *   error          — pesan error terakhir (string | null)
 *   platform       — "android" | "web"
 *
 * Metode:
 *   scanPrinters()
 *   connect(address, name)
 *   disconnect()
 *   setPaperWidth(mm)
 *   printTest()
 *   autoConnect()
 */
export function usePrinter() {
  const [connected, setConnected] = useState(false);
  const [printerName, setPrinterName] = useState("");
  const [printerAddress, setPrinterAddress] = useState("");
  const [defaultName, setDefaultName] = useState("");
  const [defaultAddress, setDefaultAddress] = useState("");
  const [paperWidthMm, setPaperWidthMm] = useState(58);
  const [printers, setPrinters] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(null);

  const listenerRef = useRef(null);
  const platform = isNative() ? "android" : "web";

  // ── Perbarui state dari payload connectionChanged atau getStatus ─────────
  function applyStatus(s) {
    if (!s) return;
    setConnected(!!s.connected);
    setPrinterAddress(s.connected ? s.address || "" : "");
    setPrinterName(s.connected ? s.name || "" : "");
    setDefaultAddress(s.defaultAddress || "");
    setDefaultName(s.defaultName || "");
    if (s.paperWidthMm) setPaperWidthMm(s.paperWidthMm);
  }

  // ── Mount: ambil status + pasang listener + coba auto-reconnect ──────────
  useEffect(() => {
    if (!isNative()) return;

    let cancelled = false;

    async function init() {
      try {
        const status = await ThermalPrinter.getStatus();
        if (!cancelled) applyStatus(status);
      } catch (e) {
        console.warn("[Printer] getStatus:", e?.message);
      }

      if (cancelled) return;

      // Pasang event listener connectionChanged
      listenerRef.current = await ThermalPrinter.addListener(
        "connectionChanged",
        (payload) => {
          if (!cancelled) applyStatus(payload);
        },
      );

      // Auto-reconnect ke printer default (best-effort, tidak throw error)
      try {
        await ThermalPrinter.autoConnect();
      } catch (e) {
        console.warn("[Printer] autoConnect:", e?.message);
      }
    }

    init();

    return () => {
      cancelled = true;
      listenerRef.current?.remove?.();
      listenerRef.current = null;
    };
  }, []);

  // ── scanPrinters ──────────────────────────────────────────────────────────
  const scanPrinters = useCallback(async () => {
    if (!isNative()) {
      setError("Scan printer hanya tersedia di Android");
      return;
    }
    setError(null);
    setScanning(true);
    try {
      const perm = await ThermalPrinter.requestBluetoothPermission();
      if (!perm?.granted) {
        setError("Izin Bluetooth ditolak");
        return;
      }
      const res = await ThermalPrinter.scanPrinters();
      setPrinters(res?.devices || []);
    } catch (e) {
      setError(e?.message || "Gagal scan printer");
    } finally {
      setScanning(false);
    }
  }, []);

  // ── connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(async (address, name) => {
    if (!isNative()) {
      setError("Hanya tersedia di Android");
      return;
    }
    setError(null);
    setConnecting(true);
    try {
      await ThermalPrinter.connect({ address, name: name || address });
      // status akan diupdate lewat connectionChanged event
    } catch (e) {
      setError(e?.message || "Gagal terhubung ke printer");
    } finally {
      setConnecting(false);
    }
  }, []);

  // ── disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    if (!isNative()) return;
    try {
      await ThermalPrinter.disconnect();
    } catch (e) {
      setError(e?.message || "Gagal disconnect");
    }
  }, []);

  // ── setPaperWidth ─────────────────────────────────────────────────────────
  const setPaperWidth = useCallback(async (mm) => {
    if (!isNative()) {
      setPaperWidthMm(mm);
      return;
    }
    try {
      await ThermalPrinter.setPaperWidth({ mm });
      setPaperWidthMm(mm);
    } catch (e) {
      setError(e?.message || "Gagal set paper width");
    }
  }, []);

  // ── printTest ─────────────────────────────────────────────────────────────
  const printTest = useCallback(async () => {
    if (!isNative()) {
      setError("Hanya tersedia di Android");
      return;
    }
    setError(null);
    setPrinting(true);
    try {
      await ThermalPrinter.printTest();
    } catch (e) {
      setError(e?.message || "Gagal test print");
    } finally {
      setPrinting(false);
    }
  }, []);

  // ── autoConnect ───────────────────────────────────────────────────────────
  const autoConnect = useCallback(async () => {
    if (!isNative()) return { connected: false };
    try {
      return await ThermalPrinter.autoConnect();
    } catch {
      return { connected: false };
    }
  }, []);

  return {
    // state
    connected,
    printerName,
    printerAddress,
    defaultName,
    defaultAddress,
    paperWidthMm,
    printers,
    scanning,
    connecting,
    printing,
    error,
    platform,
    // methods
    scanPrinters,
    connect,
    disconnect,
    setPaperWidth,
    printTest,
    autoConnect,
  };
}

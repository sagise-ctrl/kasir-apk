import { useState, useRef, useEffect } from "react";
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
} from "@zxing/library";
import { Capacitor } from "@capacitor/core";

import { MlkitBarcodeScanner } from "../native/mlkit-barcode-scanner";

/**
 * Scanner adapter:
 * - Web: ZXing + getUserMedia (video DOM) — single-shot: detects one
 *   barcode, then auto-stops (unchanged behavior).
 * - Android (Capacitor): native ML Kit via MlkitBarcodeScanner, continuous
 *   scanning — the camera activity stays open across many scans; each
 *   detected barcode is forwarded to `onNativeBarcodeDetected`, which is
 *   expected to resolve the result and call `showFeedback`/
 *   `showDuplicatePrompt` so the native side knows when to resume.
 *
 * Business logic (product lookup / cart) lives entirely in the caller.
 */
export function useBarcodeScanner({
  mode = "continuous",
  onBarcodeDetected,
  onNativeBarcodeDetected,
  onDuplicateResolved,
} = {}) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");

  // Web ZXing video element
  const videoRef = useRef(null);

  // Web ZXing refs
  const readerRef = useRef(null);
  const streamRef = useRef(null);
  const focusIntervalRef = useRef(null);
  const scanningRef = useRef(false);
  const lastDetectionTimeRef = useRef(0);

  // Android native listener handles
  const androidListenerRef = useRef(null);
  const duplicateListenerRef = useRef(null);
  const closedListenerRef = useRef(null);

  // Ref mirror untuk callback props: listener native hanya didaftarkan sekali
  // (dijaga oleh duplicateListenerRef / androidListenerRef), sehingga closure
  // di dalamnya menangkap versi lama dari prop. Dengan menyimpan prop ke ref
  // dan selalu memperbarui ref setiap render, listener selalu memanggil
  // versi terbaru tanpa perlu mendaftarkan ulang.
  const onDuplicateResolvedRef = useRef(onDuplicateResolved);
  onDuplicateResolvedRef.current = onDuplicateResolved;
  const onNativeBarcodeDetectedRef = useRef(onNativeBarcodeDetected);
  onNativeBarcodeDetectedRef.current = onNativeBarcodeDetected;

  const isAndroidCapacitor = () => Capacitor.isNativePlatform?.() === true;

  const canVibrate = () =>
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

  function createOptimizedReader() {
    const hints = new Map();

    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
    ]);

    hints.set(DecodeHintType.TRY_HARDER, false);
    hints.set(DecodeHintType.PURE_BARCODE, true);
    hints.set(DecodeHintType.ALLOW_EAN_EXTENSIONS, false);

    return new BrowserMultiFormatReader(hints);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Web (ZXing)
  // ─────────────────────────────────────────────────────────────────────
  async function startCameraWeb() {
    setError("");
    scanningRef.current = true;

    try {
      readerRef.current = createOptimizedReader();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, min: 15 },
          advanced: [
            { focusMode: "manual", zoom: 1.0 },
            { focusMode: "continuous" },
            { focusMode: "auto" },
          ],
        },
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack?.getCapabilities?.()) {
        const caps = videoTrack.getCapabilities();

        if (caps.focusMode?.includes("continuous")) {
          await videoTrack.applyConstraints({
            advanced: [{ focusMode: "continuous" }],
          });
        }

        if (focusIntervalRef.current) clearInterval(focusIntervalRef.current);
        focusIntervalRef.current = setInterval(async () => {
          try {
            await videoTrack
              .applyConstraints({
                advanced: [{ focusMode: "continuous" }],
              })
              .catch(() => {});
          } catch {}
        }, 5000);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;

      await readerRef.current.decodeFromStream(
        stream,
        videoRef.current,
        (result) => {
          const now = Date.now();
          if (!result || !scanningRef.current) return;
          if (now - lastDetectionTimeRef.current < 500) return;

          lastDetectionTimeRef.current = now;
          scanningRef.current = false;

          const barcode = result.getText();

          if (canVibrate()) navigator.vibrate(50);
          onBarcodeDetected?.(barcode);
        },
      );
    } catch (err) {
      setError(`Error camera: ${err?.message || String(err)}`);
      console.error("Camera error:", err);
      stopCameraWeb();
    }
  }

  function stopCameraWeb() {
    scanningRef.current = false;

    if (focusIntervalRef.current) {
      clearInterval(focusIntervalRef.current);
      focusIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }

    if (readerRef.current) {
      try {
        readerRef.current.reset();
      } catch (e) {
        console.warn("Reader reset error:", e);
      }
      readerRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScanning(false);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Android (Native ML Kit via Capacitor plugin)
  // ─────────────────────────────────────────────────────────────────────
  async function startScanAndroidNative() {
    setError("");
    scanningRef.current = true;

    try {
      const perm = await MlkitBarcodeScanner.requestCameraPermission();
      if (!perm?.granted) {
        setError("Izin kamera ditolak");
        scanningRef.current = false;
        return;
      }

      if (!androidListenerRef.current) {
        androidListenerRef.current = await MlkitBarcodeScanner.addListener(
          "barcodeDetected",
          ({ barcode }) => {
            if (!barcode) return;
            // Continuous mode: CameraActivity pauses its own analyzer as
            // soon as it reads a barcode and only resumes once we call
            // showFeedback()/showDuplicatePrompt() below (or its own
            // safety timeout fires) — so every event here is a fresh scan.
            // Gunakan ref agar selalu memanggil versi callback terbaru.
            onNativeBarcodeDetectedRef.current?.(barcode);
          },
        );
      }

      if (!duplicateListenerRef.current) {
        duplicateListenerRef.current = await MlkitBarcodeScanner.addListener(
          "duplicateResolved",
          (payload) => {
            // Gunakan ref agar selalu memanggil versi callback terbaru,
            // bukan versi yang tertangkap saat listener pertama kali didaftarkan.
            onDuplicateResolvedRef.current?.(payload);
          },
        );
      }

      if (!closedListenerRef.current) {
        closedListenerRef.current = await MlkitBarcodeScanner.addListener(
          "scanClosed",
          () => {
            // Native side already closed itself (the "Selesai" button) —
            // just mirror that state locally, no need to send stopScan again.
            cleanupAndroidNativeListeners();
            scanningRef.current = false;
            setIsScanning(false);
          },
        );
      }

      await MlkitBarcodeScanner.startScan({ mode });
    } catch (err) {
      setError(err?.message ? String(err.message) : "Error native scan");
      console.error("Android scan error:", err);
      scanningRef.current = false;
    }
  }

  function cleanupAndroidNativeListeners() {
    try {
      androidListenerRef.current?.remove?.();
    } catch {}
    try {
      duplicateListenerRef.current?.remove?.();
    } catch {}
    try {
      closedListenerRef.current?.remove?.();
    } catch {}
    androidListenerRef.current = null;
    duplicateListenerRef.current = null;
    closedListenerRef.current = null;
  }

  async function stopScanAndroidNative() {
    scanningRef.current = false;
    cleanupAndroidNativeListeners();

    try {
      await MlkitBarcodeScanner.stopScan();
    } catch {}

    setIsScanning(false);
  }

  /** Beri tahu native: tampilkan banner sukses/gagal (~1 detik), lalu resume otomatis. */
  async function showFeedback(type, message, durationMs) {
    if (!isAndroidCapacitor()) return;
    try {
      await MlkitBarcodeScanner.showFeedback({ type, message, durationMs });
    } catch (err) {
      console.error("showFeedback error:", err);
    }
  }

  /** Beri tahu native: tampilkan dialog "sudah di keranjang, tambah berapa?". */
  async function showDuplicatePrompt(barcode, productName, currentQty) {
    if (!isAndroidCapacitor()) return;
    try {
      await MlkitBarcodeScanner.showDuplicatePrompt({
        barcode,
        productName,
        currentQty,
      });
    } catch (err) {
      console.error("showDuplicatePrompt error:", err);
    }
  }

  // Lifecycle
  useEffect(() => {
    return () => {
      stopCameraWeb();
      stopScanAndroidNative();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    videoRef,
    isScanning,
    error,
    isNative: isAndroidCapacitor(),
    showFeedback,
    showDuplicatePrompt,
    startScanning: async () => {
      setIsScanning(true);
      if (isAndroidCapacitor()) {
        await startScanAndroidNative();
      } else {
        await startCameraWeb();
      }
    },
    stopScanning: async () => {
      if (isAndroidCapacitor()) {
        await stopScanAndroidNative();
      } else {
        stopCameraWeb();
      }
    },
  };
}

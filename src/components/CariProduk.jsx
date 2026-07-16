import { useState, useRef, useEffect } from "react";
import { api } from "../utils/api";
import { rupiahFormat } from "../utils/format";
import { Spinner } from "./UI";
import { useBarcodeScanner } from "./BarcodeScanner";
import { useKeranjang } from "../context/KeranjangContext";

export function CariProduk({ onPilih, onQueryChange }) {
  const [query, setQuery] = useState("");
  const [hasil, setHasil] = useState([]);
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  // Hardware scanner detection
  const lastKeyTime = useRef(0);
  const barcodeBuffer = useRef("");

  // Mencegah pencarian produk/penambahan keranjang berjalan dobel kalau
  // callback barcode sempat terpanggil lebih dari sekali untuk sesi yang sama.
  const processingScanRef = useRef(false);

  const { items, dispatch } = useKeranjang();

  // Native (Android) barcode/duplicate listeners are registered once per
  // scan session and their closures are NOT refreshed on every re-render
  // (see useBarcodeScanner: androidListenerRef/duplicateListenerRef guard
  // against re-registering). That means a plain `items` closure inside
  // handleNativeBarcode/handleDuplicateResolved can go stale mid-session
  // (e.g. right after a product is added, a repeat scan wouldn't see it in
  // the cart yet). Mirror `items` into a ref so those handlers always read
  // the *current* cart, regardless of which render's closure is invoked.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Gunakan custom hook barcode scanner yang optimal.
  // - Web (ZXing): single-shot lama, tetap lewat cariBarcode() + stopScanning().
  // - Android native: continuous scanning — setiap barcode yang terbaca masuk
  //   ke handleNativeBarcode(), yang memutuskan found/not-found/duplicate dan
  //   memberi tahu native kapan harus resume (lewat showFeedback/showDuplicatePrompt).
  const {
    videoRef,
    isScanning,
    isNative,
    error: scannerError,
    startScanning,
    stopScanning,
    showFeedback,
    showDuplicatePrompt,
  } = useBarcodeScanner({
    onBarcodeDetected: async (barcode) => {
      await cariBarcode(barcode);
    },
    onNativeBarcodeDetected: async (barcode) => {
      await handleNativeBarcode(barcode);
    },
    onDuplicateResolved: (payload) => {
      handleDuplicateResolved(payload);
    },
  });

  useEffect(() => {
    onQueryChange?.(query);
  }, [query, onQueryChange]);

  // Search dengan debounce (turun dari 400ms jadi 300ms)
  useEffect(() => {
    if (query.trim().length === 0) {
      clearTimeout(debounceRef.current);
      setHasil([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.searchProduct(query.trim());
        setHasil((prev) => (query.trim().length === 0 ? [] : res.data || []));
      } catch {
        setHasil([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  // Dropdown positioning
  useEffect(() => {
    if (hasil.length > 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [hasil]);

  // Toggle camera mode
  async function toggleScanMode() {
    if (isScanning) {
      stopScanning();
    } else {
      processingScanRef.current = false;
      startScanning().catch((err) => {
        console.error("Scan error:", err);
      });
    }
  }

  // Cari barcode (web ZXing / hardware scanner keyboard-wedge — single shot, tidak berubah)
  async function cariBarcode(barcode) {
    // Guard: kalau pencarian barcode sebelumnya masih berjalan (atau baru saja
    // selesai), abaikan pemanggilan kedua untuk sesi scan yang sama.
    if (processingScanRef.current) return;
    processingScanRef.current = true;

    setLoading(true);
    try {
      const res = await api.getProduct(barcode);
      if (res.success) {
        pilih(res.data);
        // Auto close camera setelah produk ditemukan
        stopScanning();
      } else {
        alert("Produk tidak ditemukan: " + barcode);
        inputRef.current?.focus();
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
      processingScanRef.current = false;
    }
  }

  // Cari barcode — Android native continuous scanning.
  // Kamera TIDAK ditutup di sini; hanya memberi tahu native kapan analyzer
  // boleh resume (lewat showFeedback / showDuplicatePrompt).
  async function handleNativeBarcode(barcode) {
    if (processingScanRef.current) return;
    processingScanRef.current = true;

    try {
      const res = await api.getProduct(barcode);

      if (!res.success) {
        await showFeedback("error", "Produk tidak ditemukan", 1000);
        return;
      }

      const produk = res.data;
      const stok = Number(produk.stok) || 0;
      if (stok === 0) {
        await showFeedback("error", `Stok ${produk.nama} habis`, 1000);
        return;
      }

      const existing = itemsRef.current.find(
        (i) => i.barcode === produk.barcode,
      );
      if (existing) {
        // Sudah ada di keranjang — biarkan native yang menampilkan dialog
        // jumlah; keranjang baru diupdate setelah user Simpan (lihat
        // handleDuplicateResolved).
        await showDuplicatePrompt(produk.barcode, produk.nama, existing.qty);
        return;
      }

      dispatch({ type: "TAMBAH", produk });
      await showFeedback(
        "success",
        `${produk.nama} berhasil ditambahkan`,
        1000,
      );
    } catch (e) {
      await showFeedback(
        "error",
        e?.message || "Gagal memproses barcode",
        1000,
      );
    } finally {
      processingScanRef.current = false;
    }
  }

  // Setelah dialog "sudah di keranjang" selesai (Simpan/Batal) di sisi native.
  function handleDuplicateResolved({ barcode, action, qty } = {}) {
    if (action !== "add") return;
    const jumlah = Number(qty) || 0;
    if (jumlah <= 0) return;

    const existing = itemsRef.current.find((i) => i.barcode === barcode);
    if (!existing) return;

    dispatch({ type: "SET_QTY", barcode, qty: (existing.qty || 0) + jumlah });
  }

  // Pilih produk
  function pilih(produk) {
    const stok = Number(produk.stok) || 0;
    if (stok === 0) {
      alert(`Stok ${produk.nama} habis, tidak bisa ditambah ke keranjang`);
      inputRef.current?.focus();
      return;
    }
    onPilih(produk);
    setQuery("");
    setHasil([]);
    inputRef.current?.focus();
  }

  // Hardware scanner (tombol fisik)
  function handleKeyDown(e) {
    const now = Date.now();
    if (e.key === "Enter") {
      if (now - lastKeyTime.current < 60 && barcodeBuffer.current.length > 4) {
        const barcode = barcodeBuffer.current;
        barcodeBuffer.current = "";
        setQuery("");
        setHasil([]);
        e.preventDefault();
        cariBarcode(barcode);
        return;
      }
      barcodeBuffer.current = "";
    } else {
      barcodeBuffer.current =
        now - lastKeyTime.current < 60 ? barcodeBuffer.current + e.key : e.key;
    }
    lastKeyTime.current = now;
  }

  return (
    <div className="relative space-y-3">
      {/* Input bar */}
      <div ref={containerRef} className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {loading ? <Spinner size={16} /> : "🔍"}
          </span>
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim() === "") setHasil([]);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Scan barcode atau ketik nama produk..."
            className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent
                       bg-white shadow-sm"
          />
        </div>

        {/* Camera button */}
        <button
          onClick={toggleScanMode}
          title="Scan dengan kamera"
          className={`px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
            isScanning
              ? "bg-indigo-600 border-indigo-600 text-white"
              : "bg-white border-gray-200 text-gray-500 hover:border-indigo-400"
          }`}
        >
          📷
        </button>
      </div>

      {/* Error message */}
      {scannerError && (
        <div className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2">
          {scannerError}
        </div>
      )}

      {/* Camera viewfinder (web/ZXing fallback only) — di Android native, satu-satunya
          preview scanner adalah CameraActivity native ML Kit; overlay React ini
          tidak boleh dirender bersamaan supaya tidak ada dua scanner aktif. */}
      {isScanning && !isNative && (
        <div className="relative rounded-2xl overflow-hidden bg-black shadow-lg">
          <video
            ref={videoRef}
            className="w-full max-h-64 object-cover"
            autoPlay
            playsInline
            muted
          />
          {/* Overlay crosshair */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-52 h-32 border-2 border-white/70 rounded-lg relative">
              {/* Sudut */}
              {[
                "top-0 left-0",
                "top-0 right-0",
                "bottom-0 left-0",
                "bottom-0 right-0",
              ].map((pos, i) => (
                <div
                  key={i}
                  className={`absolute w-5 h-5 border-indigo-400 ${pos} ${
                    i < 2 ? "border-t-2" : "border-b-2"
                  } ${i % 2 === 0 ? "border-l-2" : "border-r-2"}`}
                />
              ))}
              {/* Garis scan animasi */}
              <div className="absolute left-0 right-0 h-0.5 bg-indigo-400/80 animate-scan" />
            </div>
          </div>
          {/* Tombol tutup */}
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
      )}

      {/* Dropdown hasil search */}
      {!isScanning && hasil.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
          }}
          className="z-[9999] bg-white border border-gray-100 rounded-xl shadow-lg overflow-y-auto max-h-[50vh]"
        >
          {hasil.map((p) => {
            const stokNum = Number(p.stok) || 0;
            const stokHabis = stokNum === 0;
            const stokMenipis = stokNum > 0 && stokNum <= 5;

            return (
              <button
                key={p.barcode}
                onClick={() => !stokHabis && pilih(p)}
                disabled={stokHabis}
                className={`w-full flex items-center justify-between px-4 py-3
                           transition-colors border-b border-gray-50 last:border-0
                           ${
                             stokHabis
                               ? "opacity-50 cursor-not-allowed bg-gray-50"
                               : "hover:bg-indigo-50"
                           }`}
              >
                <div className="text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800 text-sm">
                      {p.nama}
                    </span>
                    {stokHabis && (
                      <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                        Habis
                      </span>
                    )}
                    {stokMenipis && (
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        Menipis
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {p.barcode} · Stok: {p.stok} {p.satuan}
                  </div>
                </div>
                <div
                  className={`text-sm font-bold whitespace-nowrap ml-4 ${
                    stokHabis ? "text-gray-400" : "text-indigo-600"
                  }`}
                >
                  {rupiahFormat(p.harga)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!isScanning && query.length > 0 && hasil.length === 0 && !loading && (
        <div
          className="absolute top-14 left-0 right-0 z-30 bg-white border border-gray-100
                      rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400"
        >
          Produk tidak ditemukan
        </div>
      )}
    </div>
  );
}

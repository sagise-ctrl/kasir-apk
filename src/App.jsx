import { useState, useEffect, useCallback, useRef } from "react";
import { KeranjangProvider } from "./context/KeranjangContext";
import { HalamanKasir } from "./pages/HalamanKasir";
import { HalamanHutang } from "./pages/HalamanHutang";
import { HalamanLaporan } from "./pages/HalamanLaporan";
import { HalamanPengaturan } from "./pages/HalamanPengaturan";
import { HalamanProduk } from "./pages/HalamanProduk";
import { HalamanInventori } from "./pages/HalamanInventori";
import { getPendingQueue, markQueueDone, markQueueFailed } from "./utils/db";
import { db } from "./utils/db";
import { setOnlineStatus } from "./utils/networkStatus";

const BASE_URL =
  "https://script.google.com/macros/s/AKfycbwVEHwdCKAa2w9fbthBbgZpy3ic2vCWwuypQZqKckilKnAbfFaT-MnGrRaHnSypLbraYw/exec";

const MENU = [
  { key: "kasir", label: "Kasir", icon: "🏪" },
  { key: "produk", label: "Produk", icon: "📦" },
  { key: "inventori", label: "Inventori", icon: "📋" },
  { key: "hutang", label: "Hutang", icon: "📋" },
  { key: "laporan", label: "Laporan", icon: "📊" },
  { key: "settings", label: "Setting", icon: "⚙️" },
];

// ─── Kirim 1 item dari sync queue ke GAS ─────────────────────────────────────
async function flushQueueItem(item) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    body: JSON.stringify({ action: item.action, ...item.payload }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ─── Cek koneksi real dengan ping ke server ─────────────────────────────────
async function cekKoneksiReal() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    // Pakai image/favicon kecil sebagai ping, bukan GAS endpoint
    // Tambahkan timestamp agar tidak di-cache
    const res = await fetch(
      `${window.location.origin}/icon-192.png?t=${Date.now()}`,
      {
        signal: controller.signal,
        cache: "no-store",
      },
    );
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Format waktu sync terakhir ─────────────────────────────────────────────
function formatLastSync() {
  const t = localStorage.getItem("lastSync");
  if (!t) return "";
  const d = new Date(t);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

// ─── Sync data produk & hutang untuk offline ────────────────────────────────
async function syncDataOffline(setCacheStatus) {
  setCacheStatus("syncing");
  try {
    const { api } = await import("./utils/api");
    await api.getAllProducts(); // otomatis cache ke IndexedDB
    await api.getAllHutang(); // otomatis cache ke IndexedDB
    setCacheStatus("ready");
    localStorage.setItem("lastSync", new Date().toISOString());
  } catch {
    setCacheStatus("empty");
  }
}

export default function App() {
  const [halaman, setHalaman] = useState("kasir");
  const [online, setOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncToast, setSyncToast] = useState(null); // { type: 'success'|'error', msg }
  const [failedCount, setFailedCount] = useState(0);
  const [cacheStatus, setCacheStatus] = useState("unknown"); // 'unknown' | 'syncing' | 'ready' | 'empty'
  const [appReady, setAppReady] = useState(false);
  const syncInterval = useRef(null);
  const isSyncingRef = useRef(false);

  async function retryFailed() {
    const failedItems = await db.syncQueue
      .where("status")
      .equals("failed")
      .toArray();

    for (const item of failedItems) {
      await db.syncQueue.update(item.id, { status: "pending", retryCount: 0 });
    }

    setFailedCount(0);
    await flushQueue();
  }

  // ── Cek koneksi real saat app dibuka ──────────────────────────────────────
  useEffect(() => {
    // Cek koneksi dulu, baru set app ready
    cekKoneksiReal().then((status) => {
      setOnlineStatus(status);
      setOnline(status);
      setAppReady(true);
      refreshFailedCount();
      if (status) syncDataOffline(setCacheStatus);
    });
  }, []);

  // ── Cek jumlah pending queue ─────────────────────────────────────────────
  const refreshPendingCount = useCallback(async () => {
    const queue = await getPendingQueue();
    setPendingCount(queue.length);
  }, []);

  async function refreshFailedCount() {
    const queue = await db.syncQueue.where("status").equals("failed").count();
    setFailedCount(queue);
  }

  // ── Flush semua pending queue ke GAS ─────────────────────────────────────
  const flushQueue = useCallback(async () => {
    if (isSyncingRef.current || !navigator.onLine) return;
    const queue = await getPendingQueue();
    if (queue.length === 0) return;

    const MAX_RETRY = 3;

    isSyncingRef.current = true;
    setSyncing(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const item of queue) {
        try {
          await flushQueueItem(item);
          await markQueueDone(item.id);
          successCount++;
        } catch (err) {
          const retryCount = (item.retryCount || 0) + 1;
          if (retryCount >= MAX_RETRY) {
            await markQueueFailed(item.id, err);
            failCount++;
          } else {
            // Belum max retry, set pending lagi untuk dicoba ulang
            await db.syncQueue.update(item.id, {
              status: "pending",
              retryCount: retryCount,
              lastError: err?.message,
            });
          }
        }
      }
    } finally {
      isSyncingRef.current = false;
      setSyncing(false);
      await refreshPendingCount();
      await refreshFailedCount();
    }

    if (successCount > 0) {
      setSyncToast({
        type: "success",
        msg: `${successCount} transaksi berhasil disync ke server`,
      });
      setTimeout(() => setSyncToast(null), 3000);
    }
    if (failCount > 0) {
      setSyncToast({
        type: "error",
        msg: `${failCount} transaksi gagal sync, akan dicoba lagi`,
      });
      setTimeout(() => setSyncToast(null), 4000);
    }
  }, [syncing, refreshPendingCount]);

  // ── Listener online/offline ───────────────────────────────────────────────
  useEffect(() => {
    const handleOnline = async () => {
      // Verifikasi dengan ping real sebelum set online
      const isOnline = await cekKoneksiReal();
      setOnline(isOnline);
      setOnlineStatus(isOnline);
      if (isOnline) {
        // Flush queue saat koneksi kembali
        flushQueue();
        // Sync data untuk offline
        syncDataOffline(setCacheStatus);
      }
    };
    const handleOffline = () => {
      setOnline(false);
      setOnlineStatus(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flushQueue]);

  // ── Background sync tiap 30 detik ────────────────────────────────────────
  useEffect(() => {
    refreshPendingCount();
    syncInterval.current = setInterval(async () => {
      const isOnline = await cekKoneksiReal();
      if (isOnline) flushQueue();
      refreshPendingCount();
      refreshFailedCount();
    }, 30_000);
    return () => clearInterval(syncInterval.current);
  }, [flushQueue, refreshPendingCount]);

  if (!appReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-4xl">🏪</div>
          <div className="text-sm text-gray-500">Mempersiapkan aplikasi...</div>
        </div>
      </div>
    );
  }

  return (
    <KeranjangProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* ── Top bar ────────────────────────────────────────────────────── */}
        <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img
                src="/icon-192.png"
                alt="Logo"
                className="w-10 h-10 rounded-xl object-cover"
              />
              <div>
                <div className="font-black text-gray-800 leading-tight">
                  Toko AN
                </div>
                <div className="text-xs text-gray-400 leading-tight">
                  {localStorage.getItem("kasir_nama") || "Set nama kasir"}
                </div>
              </div>
            </div>

            {/* Status online + pending badge */}
            <div className="flex items-center gap-2">
              {/* Indikator online/offline */}
              <div className="flex items-center gap-1.5">
                {syncing ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                    <svg
                      className="animate-spin w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8z"
                      />
                    </svg>
                    Syncing...
                  </span>
                ) : online ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                    Online
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-50 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
                    Offline
                  </span>
                )}

                {/* Indikator cache status */}
                {cacheStatus === "syncing" && (
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    ⏬ Mengunduh data...
                  </span>
                )}
                {cacheStatus === "ready" && (
                  <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    ✅ Offline siap · {formatLastSync()}
                  </span>
                )}
                {cacheStatus === "empty" && (
                  <span className="text-xs font-semibold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
                    ⚠️ Belum ada data offline
                  </span>
                )}

                {/* Badge pending queue */}
                {pendingCount > 0 && (
                  <span className="text-xs font-bold text-white bg-orange-500 px-2 py-0.5 rounded-full">
                    {pendingCount} pending
                  </span>
                )}

                {failedCount > 0 && (
                  <button
                    onClick={retryFailed}
                    className="flex items-center gap-1 text-xs font-bold text-white bg-red-500 px-2.5 py-1 rounded-full hover:bg-red-600 transition-colors"
                    title="Klik untuk coba kirim ulang"
                  >
                    ⚠️ {failedCount} gagal sync
                  </button>
                )}
              </div>

              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-1">
                {MENU.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setHalaman(m.key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                                transition-all duration-150 ${
                                  halaman === m.key
                                    ? "bg-indigo-600 text-white shadow-sm"
                                    : "text-gray-500 hover:bg-gray-100"
                                }`}
                  >
                    <span>{m.icon}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </header>

        {/* ── Banner offline ──────────────────────────────────────────────── */}
        {!online && (
          <div className="bg-orange-50 border-b border-orange-200 px-4 py-2">
            <div className="max-w-6xl mx-auto flex items-center gap-2 text-sm text-orange-800">
              <span>📡</span>
              <span>
                <strong>Mode Offline</strong> — Transaksi tetap berjalan dan
                akan otomatis sync saat koneksi kembali
                {pendingCount > 0 && ` (${pendingCount} transaksi menunggu)`}
              </span>
            </div>
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-visible">
          <div className="max-w-6xl mx-auto h-full">
            {halaman === "kasir" && <HalamanKasir />}
            {halaman === "produk" && <HalamanProduk />}
            {halaman === "inventori" && <HalamanInventori />}
            {halaman === "hutang" && <HalamanHutang />}
            {halaman === "laporan" && <HalamanLaporan />}
            {halaman === "settings" && <HalamanPengaturan />}
          </div>
        </main>

        {/* ── Bottom nav mobile ───────────────────────────────────────────── */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100
                      flex shadow-lg z-40"
        >
          {MENU.map((m) => (
            <button
              key={m.key}
              onClick={() => setHalaman(m.key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold
                          transition-colors ${
                            halaman === m.key
                              ? "text-indigo-600"
                              : "text-gray-400"
                          }`}
            >
              <span className="text-xl">{m.icon}</span>
              <span>{m.label}</span>
              {halaman === m.key && (
                <div className="absolute bottom-0 w-8 h-0.5 bg-indigo-600 rounded-full" />
              )}
            </button>
          ))}
        </nav>

        {/* Spacer mobile bottom nav */}
        <div className="md:hidden h-16" />

        {/* ── Toast notifikasi sync ───────────────────────────────────────── */}
        {syncToast && (
          <div
            className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50
                        px-4 py-3 rounded-xl shadow-lg text-sm font-semibold
                        flex items-center gap-2 transition-all
                        ${
                          syncToast.type === "success"
                            ? "bg-green-600 text-white"
                            : "bg-red-600 text-white"
                        }`}
          >
            <span>{syncToast.type === "success" ? "✅" : "⚠️"}</span>
            <span>{syncToast.msg}</span>
          </div>
        )}
      </div>
    </KeranjangProvider>
  );
}

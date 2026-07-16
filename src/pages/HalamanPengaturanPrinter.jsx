import { useState } from "react";
import { usePrinter } from "../services/printerService";
import { Card, Btn, Spinner } from "../components/UI";

/**
 * Halaman Pengaturan Printer — dirender sebagai sub-section di HalamanPengaturan.
 *
 * Fitur:
 *   - Status koneksi (connected / disconnected)
 *   - Scan printer Bluetooth yang sudah dipasangkan
 *   - Connect / disconnect
 *   - Pilih lebar kertas (58mm / 80mm)
 *   - Test print
 *   - Tampil printer default tersimpan
 *   - Auto-reconnect saat komponen mount
 *
 * Hanya printer yang sudah dipasangkan (paired/bonded) di Pengaturan
 * Bluetooth Android yang muncul di daftar. Pasangkan printer dulu
 * lewat Pengaturan > Bluetooth > Sambungkan perangkat baru, lalu
 * kembali ke halaman ini.
 */
export function HalamanPengaturanPrinter() {
  const {
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
    scanPrinters,
    connect,
    disconnect,
    setPaperWidth,
    printTest,
  } = usePrinter();

  const [showList, setShowList] = useState(false);

  async function handleScan() {
    setShowList(true);
    await scanPrinters();
  }

  async function handleConnect(printer) {
    await connect(printer.address, printer.name);
    setShowList(false);
  }

  // ─── Status badge ──────────────────────────────────────────────────────────
  function StatusBadge() {
    if (connected) {
      return (
        <span
          className="flex items-center gap-1.5 text-xs font-semibold
                         text-green-700 bg-green-50 px-2.5 py-1 rounded-full"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
          Terhubung
        </span>
      );
    }
    return (
      <span
        className="flex items-center gap-1.5 text-xs font-semibold
                       text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
        Tidak terhubung
      </span>
    );
  }

  // ─── Web fallback ──────────────────────────────────────────────────────────
  if (platform === "web") {
    return (
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-700">🖨️ Printer Thermal</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
            Android only
          </span>
        </div>
        <p className="text-sm text-gray-400">
          Fitur printer Bluetooth hanya tersedia di aplikasi Android. Buka
          aplikasi di perangkat Android untuk menggunakan fitur ini.
        </p>
      </Card>
    );
  }

  // ─── Android ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Status & aksi utama ─────────────────────────────────────────── */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-700">🖨️ Printer Thermal</h3>
          <StatusBadge />
        </div>

        {/* Printer yang sedang terhubung / default */}
        <div className="text-sm space-y-1">
          {connected ? (
            <div className="bg-green-50 rounded-xl px-4 py-3 space-y-0.5">
              <div className="font-semibold text-green-800">{printerName}</div>
              <div className="text-xs text-green-600 font-mono">
                {printerAddress}
              </div>
            </div>
          ) : defaultAddress ? (
            <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-0.5">
              <div className="text-xs text-gray-400 mb-1">
                Printer default (tidak terhubung)
              </div>
              <div className="font-semibold text-gray-600">
                {defaultName || defaultAddress}
              </div>
              <div className="text-xs text-gray-400 font-mono">
                {defaultAddress}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-400">
              Belum ada printer dipilih. Scan & pilih printer di bawah.
            </div>
          )}
        </div>

        {/* Tombol connect / disconnect */}
        <div className="flex gap-2">
          {connected ? (
            <>
              <Btn
                variant="ghost"
                className="flex-1"
                onClick={disconnect}
                disabled={connecting || printing}
              >
                Disconnect
              </Btn>
              <Btn
                variant="primary"
                className="flex-1"
                onClick={printTest}
                loading={printing}
                disabled={connecting || printing}
              >
                🖨️ Test Print
              </Btn>
            </>
          ) : (
            <>
              {defaultAddress && (
                <Btn
                  variant="primary"
                  className="flex-1"
                  onClick={() => connect(defaultAddress, defaultName)}
                  loading={connecting}
                  disabled={connecting}
                >
                  {connecting ? "Menghubungkan..." : "Hubungkan"}
                </Btn>
              )}
              <Btn
                variant={defaultAddress ? "ghost" : "primary"}
                className="flex-1"
                onClick={handleScan}
                disabled={scanning || connecting}
              >
                {scanning ? (
                  <span className="flex items-center gap-2">
                    <Spinner size={14} /> Scanning...
                  </span>
                ) : (
                  "🔍 Scan Printer"
                )}
              </Btn>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
            ⚠️ {error}
          </div>
        )}
      </Card>

      {/* ── Daftar printer hasil scan ────────────────────────────────────── */}
      {showList && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-gray-700 text-sm">
              Pilih Printer
            </h4>
            <button
              onClick={() => setShowList(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Tutup
            </button>
          </div>

          {scanning ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
              <Spinner size={16} />
              <span>Memuat daftar printer...</span>
            </div>
          ) : printers.length === 0 ? (
            <div className="text-sm text-gray-400 space-y-2">
              <p>Tidak ada printer Bluetooth yang dipasangkan.</p>
              <p className="text-xs">
                Buka <strong>Pengaturan Android → Bluetooth</strong>, pasangkan
                printer thermal terlebih dahulu, lalu kembali ke sini dan scan
                ulang.
              </p>
              <Btn variant="ghost" className="w-full mt-1" onClick={handleScan}>
                🔄 Scan ulang
              </Btn>
            </div>
          ) : (
            <div className="space-y-2">
              {printers.map((p) => (
                <button
                  key={p.address}
                  onClick={() => handleConnect(p)}
                  disabled={connecting}
                  className="w-full flex items-center justify-between px-4 py-3
                             rounded-xl border border-gray-100 hover:border-indigo-300
                             hover:bg-indigo-50 transition-all text-left disabled:opacity-50"
                >
                  <div>
                    <div className="font-semibold text-sm text-gray-800">
                      {p.name}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">
                      {p.address}
                    </div>
                  </div>
                  {connecting ? (
                    <Spinner size={14} />
                  ) : (
                    <span className="text-xs text-indigo-500 font-semibold">
                      Hubungkan →
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Pengaturan kertas ────────────────────────────────────────────── */}
      <Card className="p-5 space-y-3">
        <h4 className="font-semibold text-gray-700 text-sm">Lebar Kertas</h4>
        <div className="grid grid-cols-2 gap-2">
          {[58, 80].map((mm) => (
            <button
              key={mm}
              onClick={() => setPaperWidth(mm)}
              className={`p-3 rounded-xl border-2 text-center transition-all ${
                paperWidthMm === mm
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="font-bold text-sm text-gray-800">{mm}mm</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {mm === 58 ? "32 karakter/baris" : "48 karakter/baris"}
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Sesuaikan dengan jenis printer fisik Anda. Salah setting ukuran
          menyebabkan struk terpotong atau ada spasi berlebih.
        </p>
      </Card>

      {/* ── Panduan pairing ──────────────────────────────────────────────── */}
      <Card className="p-5 space-y-2">
        <h4 className="font-semibold text-gray-700 text-sm">
          📋 Cara Pairing Printer
        </h4>
        <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
          <li>
            Nyalakan printer thermal, pastikan Bluetooth aktif di printer.
          </li>
          <li>
            Buka <strong>Pengaturan Android → Bluetooth</strong>.
          </li>
          <li>
            Cari nama printer (biasanya "RPP02", "POS-58", "Gprinter", dll.).
          </li>
          <li>
            Ketuk nama printer → Pasangkan (PIN biasanya <strong>0000</strong>{" "}
            atau <strong>1234</strong>).
          </li>
          <li>
            Kembali ke halaman ini → Scan Printer → pilih printer → Hubungkan.
          </li>
        </ol>
      </Card>
    </div>
  );
}

import { useState, useEffect } from "react";
import { api } from "../utils/api";
import { rupiahFormat } from "../utils/format";
import { Modal, Btn, Spinner, Input } from "./UI";
import { useKeranjang } from "../context/KeranjangContext";
import { printReceiptDirect } from "../services/printerService";

export function ModalBayar({ open, onClose, onSelesai }) {
  const { items, total, diskon, dispatch } = useKeranjang();
  const [metode, setMetode] = useState("cash");
  const [uangDiterima, setUangDiterima] = useState("");
  const [pelanggan, setPelanggan] = useState(null);
  const [cariPel, setCariPel] = useState("");
  const [hasilPel, setHasilPel] = useState([]);
  const [loadingPel, setLoadingPel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sukses, setSukses] = useState(null);

  const kasir = localStorage.getItem("kasir_nama") || "Kasir";
  const kembalian = (parseInt(uangDiterima) || 0) - total;
  const [printing, setPrinting] = useState(false);
  const [printMsg, setPrintMsg] = useState(null); // { ok, text }

  useEffect(() => {
    if (!open) {
      setMetode("cash");
      setUangDiterima("");
      setPelanggan(null);
      setCariPel("");
      setHasilPel([]);
      setSukses(null);
      setPrinting(false);
      setPrintMsg(null);
    }
  }, [open]);

  useEffect(() => {
    if (cariPel.trim().length < 1) {
      setHasilPel([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoadingPel(true);
      try {
        const res = await api.searchPelanggan(cariPel);
        setHasilPel(res.data || []);
      } finally {
        setLoadingPel(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [cariPel]);

  async function prosesBayar() {
    if (
      metode === "cash" &&
      (!uangDiterima || parseInt(uangDiterima) < total)
    ) {
      alert("Uang yang diterima kurang dari total belanja");
      return;
    }
    if (metode === "tempo" && !pelanggan) {
      alert("Pilih pelanggan terlebih dahulu");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        items: items.map((i) => ({
          barcode: String(i.barcode),
          nama_produk: i.nama,
          qty: i.qty,
          harga_satuan: i.harga,
        })),
        metode_bayar: metode,
        kasir,
        diskon: diskon || 0,
        id_pelanggan: pelanggan?.id_pelanggan || "",
      };

      const res = await api.createTransaction(payload);
      setSukses({
        ...res.data,
        uang_diterima: parseInt(uangDiterima) || 0,
        kembalian: metode === "cash" ? kembalian : 0,
        nama_pelanggan: pelanggan?.nama || "",
      });
    } catch (e) {
      alert("Gagal: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function selesai() {
    dispatch({ type: "KOSONGKAN" });
    setSukses(null);
    onSelesai?.();
    onClose();
  }

  // Layar sukses
  if (sukses) {
    return (
      <Modal open={open} onClose={selesai} title="Transaksi Berhasil ✅">
        <div className="text-center space-y-4">
          <div className="text-6xl">🎉</div>
          <div>
            <div className="font-bold text-2xl text-gray-800">
              {rupiahFormat(total)}
            </div>
            <div className="text-sm text-gray-400 mt-1">{sukses.id_trx}</div>
          </div>

          {sukses.metode_bayar === "cash" && (
            <div className="bg-green-50 rounded-xl p-4 text-left space-y-2">
              <Row
                label="Uang diterima"
                value={rupiahFormat(sukses.uang_diterima)}
              />
              <Row
                label="Kembalian"
                value={rupiahFormat(sukses.kembalian)}
                bold
              />
            </div>
          )}

          {sukses.metode_bayar === "tempo" && (
            <div className="bg-orange-50 rounded-xl p-4 text-left space-y-2">
              <Row label="Pelanggan" value={sukses.nama_pelanggan} />
              <Row label="Status" value="Hutang tercatat" />
              <Row label="ID Hutang" value={sukses.id_hutang} />
            </div>
          )}

          {/* ── Cetak struk ──────────────────────────────────────────── */}
          <div className="space-y-2">
            <Btn
              variant="ghost"
              size="lg"
              className="w-full"
              onClick={async () => {
                setPrinting(true);
                setPrintMsg(null);
                const storeName = "Toko AN";
                const result = await printReceiptDirect({
                  storeName,
                  cashierName: kasir,
                  items: items.map((i) => ({
                    name: i.nama,
                    qty: i.qty,
                    price: i.harga,
                    subtotal: i.harga * i.qty,
                  })),
                  subtotal: items.reduce((s, i) => s + i.harga * i.qty, 0),
                  diskon: diskon || 0,
                  total,
                  payment: sukses.uang_diterima || 0,
                  change: sukses.kembalian || 0,
                  paymentMethod: sukses.metode_bayar || metode,
                  transactionId: sukses.id_trx || "",
                });
                setPrinting(false);
                setPrintMsg(
                  result.ok
                    ? { ok: true, text: "Struk berhasil dicetak" }
                    : { ok: false, text: result.error || "Gagal cetak" },
                );
              }}
              loading={printing}
              disabled={printing}
            >
              {printing ? "Mencetak..." : "🖨️ Cetak Struk"}
            </Btn>

            {printMsg && (
              <div
                className={`text-xs text-center rounded-lg px-3 py-2 font-medium ${
                  printMsg.ok
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {printMsg.ok ? "✅" : "⚠️"} {printMsg.text}
              </div>
            )}
          </div>

          <Btn variant="success" size="lg" className="w-full" onClick={selesai}>
            Transaksi Baru
          </Btn>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Pembayaran">
      <div className="space-y-5">
        {/* Total */}
        <div className="bg-indigo-50 rounded-xl p-4 text-center">
          <div className="text-sm text-indigo-400 mb-1">Total Pembayaran</div>
          <div className="text-3xl font-black text-indigo-700">
            {rupiahFormat(total)}
          </div>
        </div>

        {/* Pilih metode */}
        <div>
          <div className="text-sm font-semibold text-gray-600 mb-2">
            Metode Pembayaran
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "cash", label: "💵 Cash", desc: "Bayar tunai" },
              { key: "tempo", label: "📋 Tempo", desc: "Bayar nanti / hutang" },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => setMetode(m.key)}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  metode === m.key
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-semibold text-sm">{m.label}</div>
                <div className="text-xs text-gray-400">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Cash: input uang */}
        {metode === "cash" && (
          <div className="space-y-3">
            <Input
              label="Uang Diterima (Rp)"
              type="number"
              value={uangDiterima}
              onChange={(e) => setUangDiterima(e.target.value)}
              placeholder="0"
              autoFocus
            />
            {/* Tombol nominal cepat */}
            <div className="flex flex-wrap gap-2">
              {[5000, 10000, 20000, 50000, 100000].map((n) => (
                <button
                  key={n}
                  onClick={() =>
                    setUangDiterima(String(Math.ceil(total / n) * n))
                  }
                  className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-indigo-100
                             rounded-lg font-medium text-gray-700 transition-colors"
                >
                  {rupiahFormat(Math.ceil(total / n) * n)}
                </button>
              ))}
            </div>

            {uangDiterima && (
              <div
                className={`rounded-xl p-3 flex justify-between items-center ${
                  kembalian >= 0 ? "bg-green-50" : "bg-red-50"
                }`}
              >
                <span className="text-sm font-medium text-gray-600">
                  Kembalian
                </span>
                <span
                  className={`font-bold text-lg ${
                    kembalian >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {rupiahFormat(Math.max(kembalian, 0))}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Tempo: pilih pelanggan */}
        {metode === "tempo" && (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-gray-600">
              Pilih Pelanggan
            </div>

            {pelanggan ? (
              <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">
                    {pelanggan.nama}
                  </div>
                  <div className="text-xs text-gray-400">
                    {pelanggan.telp || "No HP tidak ada"}
                  </div>
                </div>
                <button
                  onClick={() => setPelanggan(null)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Ganti
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={cariPel}
                  onChange={(e) => setCariPel(e.target.value)}
                  placeholder="Cari nama pelanggan..."
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                {loadingPel && (
                  <div className="absolute right-3 top-2.5">
                    <Spinner size={16} />
                  </div>
                )}
                {hasilPel.length > 0 && (
                  <div
                    className="absolute top-full left-0 right-0 z-10 mt-1 bg-white
                                  border border-gray-100 rounded-xl shadow-lg overflow-hidden"
                  >
                    {hasilPel.map((p) => (
                      <button
                        key={p.id_pelanggan}
                        onClick={() => {
                          setPelanggan(p);
                          setCariPel("");
                          setHasilPel([]);
                        }}
                        className="w-full flex items-center justify-between px-4 py-2.5
                                   hover:bg-orange-50 border-b border-gray-50 last:border-0 text-left"
                      >
                        <div>
                          <div className="font-semibold text-sm text-gray-800">
                            {p.nama}
                          </div>
                          <div className="text-xs text-gray-400">
                            {p.telp || p.id_pelanggan}
                          </div>
                        </div>
                        {p.total_hutang > 0 && (
                          <span className="text-xs text-red-500 font-semibold">
                            Hutang: {rupiahFormat(p.total_hutang)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <TambahPelangganBaru onTambah={setPelanggan} />
          </div>
        )}

        {/* Tombol bayar */}
        <Btn
          variant="success"
          size="lg"
          className="w-full"
          onClick={prosesBayar}
          loading={loading}
          disabled={
            loading ||
            (metode === "cash" && (!uangDiterima || kembalian < 0)) ||
            (metode === "tempo" && !pelanggan)
          }
        >
          {loading ? "Memproses..." : "✅ Konfirmasi Bayar"}
        </Btn>
      </div>
    </Modal>
  );
}

function TambahPelangganBaru({ onTambah }) {
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState("");
  const [telp, setTelp] = useState("");
  const [loading, setLoading] = useState(false);

  async function simpan() {
    if (!nama.trim()) return;
    setLoading(true);
    try {
      const res = await api.createPelanggan({ nama: nama.trim(), telp });
      onTambah(res.data);
      setOpen(false);
      setNama("");
      setTelp("");
    } catch (e) {
      alert("Gagal: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-indigo-500 hover:text-indigo-700 font-medium"
      >
        + Tambah pelanggan baru
      </button>
    );
  }

  return (
    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
      <div className="text-sm font-semibold text-gray-700">Pelanggan Baru</div>
      <Input
        placeholder="Nama *"
        value={nama}
        onChange={(e) => setNama(e.target.value)}
      />
      <Input
        placeholder="No HP (opsional)"
        value={telp}
        onChange={(e) => setTelp(e.target.value)}
      />
      <div className="flex gap-2">
        <Btn variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Batal
        </Btn>
        <Btn variant="primary" size="sm" onClick={simpan} loading={loading}>
          Simpan
        </Btn>
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={bold ? "font-bold text-gray-800" : "text-gray-700"}>
        {value}
      </span>
    </div>
  );
}

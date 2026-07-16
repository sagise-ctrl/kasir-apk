import { useState, useEffect } from "react";
import { api } from "../utils/api";
import { rupiahFormat, tglFormat } from "../utils/format";
import {
  Card,
  Btn,
  Spinner,
  Modal,
  Input,
  EmptyState,
  Badge,
} from "../components/UI";

export function HalamanHutang() {
  const [daftarHutang, setDaftarHutang] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null); // hutang yang dipilih untuk bayar
  const [modalBayar, setModalBayar] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);

  async function loadHutang() {
    setLoading(true);
    try {
      const res = await api.getAllHutang();
      // Cek apakah response dari offline fallback
      if (res.offline) {
        setDaftarHutang(res.data || []);
        setOfflineMode(true);
      } else {
        setDaftarHutang(res.data || []);
        setOfflineMode(false);
      }
    } catch (e) {
      alert("Gagal memuat hutang: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHutang();
  }, []);

  const filtered = daftarHutang.filter(
    (h) =>
      h.nama_pelanggan?.toLowerCase().includes(search.toLowerCase()) ||
      h.id_pelanggan?.toLowerCase().includes(search.toLowerCase()),
  );

  const totalSemua = daftarHutang.reduce((s, h) => s + (h.sisa || 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Header summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-gray-400 mb-1">Total Piutang Aktif</div>
          <div className="text-2xl font-black text-red-500">
            {rupiahFormat(totalSemua)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-400 mb-1">Pelanggan Berhutang</div>
          <div className="text-2xl font-black text-gray-800">
            {daftarHutang.length}
          </div>
        </Card>
      </div>

      {/* Search + refresh */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Cari nama pelanggan..."
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <Btn variant="ghost" size="md" onClick={loadHutang}>
          🔄
        </Btn>
      </div>

      {/* List hutang */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="Tidak ada hutang aktif"
          desc="Semua pelanggan sudah lunas!"
        />
      ) : (
        <>
          {offlineMode && daftarHutang.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center mb-3">
              <span className="text-sm text-amber-700">
                📡 Data dari cache terakhir (mode offline)
              </span>
            </div>
          )}
          <div className="space-y-3">
            {filtered.map((hutang) => (
              <HutangCard
                key={hutang.id_hutang}
                hutang={hutang}
                onBayar={() => {
                  setSelected(hutang);
                  setModalBayar(true);
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* Modal bayar cicilan */}
      <ModalBayarCicilan
        open={modalBayar}
        hutang={selected}
        onClose={() => {
          setModalBayar(false);
          setSelected(null);
        }}
        onSelesai={() => {
          loadHutang();
          setModalBayar(false);
          setSelected(null);
        }}
      />
    </div>
  );
}

function HutangCard({ hutang, onBayar }) {
  const persen =
    hutang.total_hutang > 0
      ? Math.round((hutang.terbayar / hutang.total_hutang) * 100)
      : 0;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-800">
              {hutang.nama_pelanggan}
            </span>
            <Badge color="gray">{hutang.id_pelanggan}</Badge>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {hutang.id_hutang} · {tglFormat(hutang.tgl_hutang)}
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Terbayar: {rupiahFormat(hutang.terbayar)}</span>
              <span>{persen}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${persen}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-3">
            <div>
              <div className="text-xs text-gray-400">Sisa Hutang</div>
              <div className="font-black text-red-500 text-lg">
                {rupiahFormat(hutang.sisa)}
              </div>
            </div>
            <Btn variant="warning" size="sm" onClick={onBayar}>
              💰 Bayar
            </Btn>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ModalBayarCicilan({ open, hutang, onClose, onSelesai }) {
  const [jumlah, setJumlah] = useState("");
  const [metode, setMetode] = useState("cash");
  const [loading, setLoading] = useState(false);
  const kasir = localStorage.getItem("kasir_nama") || "Kasir";

  useEffect(() => {
    if (open) {
      setJumlah("");
      setMetode("cash");
    }
  }, [open]);

  async function bayar() {
    if (!jumlah || parseInt(jumlah) <= 0) {
      alert("Masukkan jumlah bayar");
      return;
    }
    setLoading(true);
    try {
      await api.bayarCicilan({
        id_hutang: hutang.id_hutang,
        id_pelanggan: hutang.id_pelanggan,
        jumlah: parseInt(jumlah),
        metode,
        kasir,
      });
      onSelesai();
    } catch (e) {
      alert("Gagal: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!hutang) return null;

  return (
    <Modal open={open} onClose={onClose} title="Bayar Hutang">
      <div className="space-y-4">
        <div className="bg-red-50 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Pelanggan</span>
            <span className="font-semibold">{hutang.nama_pelanggan}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total Hutang</span>
            <span>{rupiahFormat(hutang.total_hutang)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Sudah Dibayar</span>
            <span className="text-emerald-600">
              {rupiahFormat(hutang.terbayar)}
            </span>
          </div>
          <div className="flex justify-between font-bold">
            <span className="text-gray-700">Sisa</span>
            <span className="text-red-600">{rupiahFormat(hutang.sisa)}</span>
          </div>
        </div>

        <Input
          label="Jumlah Bayar (Rp)"
          type="number"
          value={jumlah}
          onChange={(e) => setJumlah(e.target.value)}
          placeholder="0"
          autoFocus
        />

        {/* Tombol lunas sekaligus */}
        <button
          onClick={() => setJumlah(String(hutang.sisa))}
          className="text-sm text-indigo-500 hover:text-indigo-700 font-medium"
        >
          Bayar lunas ({rupiahFormat(hutang.sisa)})
        </button>

        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Metode</div>
          <div className="flex gap-2">
            {["cash", "qris"].map((m) => (
              <button
                key={m}
                onClick={() => setMetode(m)}
                className={`flex-1 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                  metode === m
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-500"
                }`}
              >
                {m === "cash" ? "💵 Cash" : "📱 QRIS"}
              </button>
            ))}
          </div>
        </div>

        <Btn
          variant="success"
          size="lg"
          className="w-full"
          onClick={bayar}
          loading={loading}
          disabled={!jumlah || parseInt(jumlah) <= 0}
        >
          Konfirmasi Pembayaran
        </Btn>
      </div>
    </Modal>
  );
}

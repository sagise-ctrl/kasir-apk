import { useState, useEffect, useMemo } from "react";
import { api } from "../utils/api";
import { rupiahFormat } from "../utils/format";
import {
  Card,
  Btn,
  Spinner,
  Modal,
  Input,
  EmptyState,
  Badge,
} from "../components/UI";
import { ScanBarcodeButton } from "../components/ScanBarcodeButton";

const KATEGORI_WARNA = {
  Sembako: "blue",
  Bumbu: "orange",
  Mie: "yellow",
  Minuman: "green",
  Makanan: "orange",
  Kebersihan: "blue",
  Lainnya: "gray",
};

export function HalamanProduk() {
  const [produk, setProduk] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kategori, setKategori] = useState("Semua");
  const [selected, setSelected] = useState(null);
  const [modalStok, setModalStok] = useState(false);
  const [filterStok, setFilterStok] = useState(null); // null=semua, 'habis'=0, 'menipis'=1-5

  async function loadProduk() {
    setLoading(true);
    try {
      const res = await api.getAllProducts();
      setProduk(res.data || []);
    } catch (e) {
      alert("Gagal memuat produk: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProduk();
  }, []);

  useEffect(() => {
    setFilterStok(null);
  }, [kategori]);

  const kategoriList = useMemo(() => {
    const k = [...new Set(produk.map((p) => p.kategori))].sort();
    return ["Semua", ...k];
  }, [produk]);

  const filtered = useMemo(() => {
    return produk.filter((p) => {
      const stokNum = Number(p.stok) || 0;
      const matchSearch =
        p.nama.toLowerCase().includes(search.toLowerCase()) ||
        String(p.barcode).includes(search);
      const matchKat = kategori === "Semua" || p.kategori === kategori;

      const matchStok =
        filterStok === "habis"
          ? stokNum === 0
          : filterStok === "menipis"
            ? stokNum > 0 && stokNum <= 5
            : true;

      return matchSearch && matchKat && matchStok;
    });
  }, [produk, search, kategori, filterStok]);

  const stokHabis = produk.filter((p) => (Number(p.stok) || 0) === 0).length;
  const stokMenipis = produk.filter((p) => {
    const s = Number(p.stok) || 0;
    return s > 0 && s <= 5;
  }).length;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-gray-800 text-xl">📦 Produk</h2>
        <Btn variant="ghost" size="sm" onClick={loadProduk}>
          🔄 Refresh
        </Btn>
      </div>

      {(stokHabis > 0 || stokMenipis > 0) && (
        <div className="flex gap-3">
          {stokHabis > 0 && (
            <button
              type="button"
              onClick={() =>
                setFilterStok(filterStok === "habis" ? null : "habis")
              }
              className={`flex-1 bg-red-50 border rounded-xl p-3 text-center transition-all
                ${
                  filterStok === "habis"
                    ? "border-red-400 ring-2 ring-red-300"
                    : "border-red-200 hover:border-red-300"
                }`}
            >
              <div className="text-2xl font-black text-red-500">
                {stokHabis}
              </div>
              <div className="text-xs text-red-400">Stok Habis</div>
            </button>
          )}

          {stokMenipis > 0 && (
            <button
              type="button"
              onClick={() =>
                setFilterStok(filterStok === "menipis" ? null : "menipis")
              }
              className={`flex-1 bg-amber-50 border rounded-xl p-3 text-center transition-all
                ${
                  filterStok === "menipis"
                    ? "border-amber-400 ring-2 ring-amber-300"
                    : "border-amber-200 hover:border-amber-300"
                }`}
            >
              <div className="text-2xl font-black text-amber-500">
                {stokMenipis}
              </div>
              <div className="text-xs text-amber-400">Stok Menipis (≤5)</div>
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Cari nama atau barcode..."
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <ScanBarcodeButton onScanned={(barcode) => setSearch(barcode)} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {kategoriList.map((k) => (
          <button
            key={k}
            onClick={() => setKategori(k)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold
                        transition-all border ${
                          kategori === k
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-gray-500 border-gray-200 hover:border-indigo-300"
                        }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="text-xs text-gray-400">
        Menampilkan {filtered.length} dari {produk.length} produk
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📦" title="Produk tidak ditemukan" />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <ProdukCard
              key={p.barcode}
              produk={p}
              onKelola={() => {
                setSelected(p);
                setModalStok(true);
              }}
            />
          ))}
        </div>
      )}

      <ModalKelolaStok
        open={modalStok}
        produk={selected}
        onClose={() => {
          setModalStok(false);
          setSelected(null);
        }}
        onSelesai={() => {
          loadProduk();
          setModalStok(false);
          setSelected(null);
        }}
      />
    </div>
  );
}

function ProdukCard({ produk: p, onKelola }) {
  const stokNum = Number(p.stok) || 0;
  const stokStatus = stokNum === 0 ? "red" : stokNum <= 5 ? "yellow" : "green";
  const stokLabel = stokNum === 0 ? "Habis" : stokNum <= 5 ? "Menipis" : "Aman";

  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-800 text-sm">{p.nama}</span>
            <Badge color={KATEGORI_WARNA[p.kategori] || "gray"}>
              {p.kategori}
            </Badge>
          </div>
          <div className="text-xs text-gray-400 mt-0.5 font-mono">
            {p.barcode}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Harga jual:{" "}
            <span className="font-semibold text-indigo-600">
              {rupiahFormat(p.harga)}
            </span>
            {p.harga_beli > 0 && (
              <span className="ml-2 text-gray-400">
                · Modal: {rupiahFormat(p.harga_beli)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-right">
            <div
              className={`font-black text-lg leading-tight ${
                stokNum === 0
                  ? "text-red-500"
                  : stokNum <= 5
                    ? "text-amber-500"
                    : "text-gray-800"
              }`}
            >
              {stokNum}
            </div>
            <div className="text-xs text-gray-400">{p.satuan}</div>
          </div>
          <Badge color={stokStatus}>{stokLabel}</Badge>
          <Btn variant="outline" size="sm" onClick={onKelola}>
            📝 Kelola Stok
          </Btn>
        </div>
      </div>
    </Card>
  );
}

function ModalKelolaStok({ open, produk, onClose, onSelesai }) {
  const [tipe, setTipe] = useState("tambah");
  const [jumlah, setJumlah] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTipe("tambah");
      setJumlah("");
    }
  }, [open]);

  if (!produk) return null;

  const previewStok = () => {
    const j = parseInt(jumlah) || 0;
    if (tipe === "tambah") return produk.stok + j;
    if (tipe === "kurangi") return Math.max(0, produk.stok - j);
    if (tipe === "set") return j;
    return produk.stok;
  };

  async function simpan() {
    if (!jumlah || parseInt(jumlah) < 0) {
      alert("Masukkan jumlah yang valid");
      return;
    }
    setLoading(true);
    try {
      await api.updateStok(String(produk.barcode), tipe, parseInt(jumlah));
      onSelesai();
    } catch (e) {
      alert("Gagal: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  const tipeOptions = [
    { key: "tambah", label: "➕ Tambah Stok", desc: "Restok dari supplier" },
    {
      key: "kurangi",
      label: "➖ Kurangi Stok",
      desc: "Koreksi / barang hilang/rusak",
    },
    { key: "set", label: "✏️ Set Manual", desc: "Atur stok ke angka tertentu" },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Kelola Stok">
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="font-bold text-gray-800">{produk.nama}</div>
          <div className="text-xs text-gray-400 font-mono">
            {produk.barcode}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-gray-500">Stok saat ini:</span>
            <span className="font-black text-xl text-gray-800">
              {produk.stok} {produk.satuan}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {tipeOptions.map((t) => (
            <button
              key={t.key}
              onClick={() => setTipe(t.key)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left
                          transition-all ${
                            tipe === t.key
                              ? "border-indigo-500 bg-indigo-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
            >
              <span className="text-lg">{t.label.split(" ")[0]}</span>
              <div>
                <div className="font-semibold text-sm text-gray-800">
                  {t.label.split(" ").slice(1).join(" ")}
                </div>
                <div className="text-xs text-gray-400">{t.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <Input
          label={
            tipe === "set"
              ? "Set stok menjadi"
              : `Jumlah yang di${tipe === "tambah" ? "tambah" : "kurangi"}`
          }
          type="number"
          value={jumlah}
          onChange={(e) => setJumlah(e.target.value)}
          placeholder="0"
          autoFocus
        />

        {jumlah && parseInt(jumlah) >= 0 && (
          <div
            className={`rounded-xl p-3 flex justify-between items-center ${
              tipe === "tambah"
                ? "bg-emerald-50"
                : tipe === "kurangi"
                  ? "bg-red-50"
                  : "bg-blue-50"
            }`}
          >
            <span className="text-sm text-gray-600">Stok setelah disimpan</span>
            <span className="font-black text-xl text-gray-800">
              {previewStok()} {produk.satuan}
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <Btn variant="ghost" className="flex-1" onClick={onClose}>
            Batal
          </Btn>
          <Btn
            variant="primary"
            className="flex-1"
            onClick={simpan}
            loading={loading}
            disabled={!jumlah || parseInt(jumlah) < 0}
          >
            Simpan
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

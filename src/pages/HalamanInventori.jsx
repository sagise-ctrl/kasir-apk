import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../utils/api";
import { rupiahFormat } from "../utils/format";
import {
  Card,
  Btn,
  Modal,
  Input,
  Spinner,
  Badge,
  EmptyState,
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

function SortIcon({ active, dir }) {
  if (!active) return <span className="text-gray-300">↕</span>;
  return dir === "asc" ? (
    <span className="text-indigo-600">↑</span>
  ) : (
    <span className="text-indigo-600">↓</span>
  );
}

export function HalamanInventori() {
  const [produk, setProduk] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedKategori, setSelectedKategori] = useState("Semua");

  const [draftList, setDraftList] = useState([]);
  const [showDraft, setShowDraft] = useState(false);
  const [loadingUpload, setLoadingUpload] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [loadingSave, setLoadingSave] = useState(false);

  const [sortKey, setSortKey] = useState("nama");

  const [sortDir, setSortDir] = useState("asc");

  function enterEditMode() {
    const initial = {};
    produk.forEach((p) => {
      initial[String(p.barcode)] = {
        nama: p.nama,
        harga: p.harga,
        harga_beli: p.harga_beli,
        satuan: p.satuan,
        kategori: p.kategori,
        aktif: p.aktif,
      };
    });
    setEditData(initial);
    setEditMode(true);
  }

  function cancelEditMode() {
    setEditData({});
    setEditMode(false);
  }

  async function saveAllEdits() {
    setLoadingSave(true);
    try {
      const changed = produk
        .filter((p) => {
          const e = editData[String(p.barcode)];
          if (!e) return false;
          return (
            String(e.nama) !== String(p.nama) ||
            Number(e.harga) !== Number(p.harga) ||
            Number(e.harga_beli) !== Number(p.harga_beli) ||
            String(e.satuan) !== String(p.satuan) ||
            String(e.kategori) !== String(p.kategori) ||
            e.aktif !== p.aktif
          );
        })
        .map((p) => ({
          barcode: p.barcode,
          ...editData[String(p.barcode)],
        }));

      if (changed.length === 0) {
        alert("Tidak ada perubahan");
        cancelEditMode();
        return;
      }

      const res = await api.bulkUpdateProduct(changed);
      const { berhasil = [], gagal = [] } = res?.data || {};

      setProduk((prev) =>
        prev.map((p) => {
          const updated = editData[String(p.barcode)];
          const berhasilItem = berhasil.find(
            (b) => String(b.barcode) === String(p.barcode),
          );
          return berhasilItem ? { ...p, ...updated } : p;
        }),
      );

      if (gagal.length > 0) {
        alert(`${berhasil.length} berhasil, ${gagal.length} gagal`);
      } else {
        alert(`${berhasil.length} produk berhasil diupdate`);
      }

      cancelEditMode();
      loadProduk();
    } catch (e) {
      alert("Gagal simpan: " + e.message);
    } finally {
      setLoadingSave(false);
    }
  }

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // 'create' | 'edit'
  const [modalForm, setModalForm] = useState({
    barcode: "",
    nama: "",
    harga: "",
    harga_beli: "",
    stok: 0,
    satuan: "",
    kategori: "",
    aktif: true,
  });

  const modalSubmitRef = useRef(null);

  async function loadProduk({ forceCacheInvalidate = false } = {}) {
    setLoading(true);
    try {
      // getAllProducts akan refresh cache IndexedDB saat online
      const res = await api.getAllProducts();
      const list = Array.isArray(res?.data) ? res.data : [];
      setProduk(list);

      // forceCacheInvalidate untuk UI saja; actual cache refresh sudah terjadi via getAllProducts
      if (forceCacheInvalidate) {
        // no-op
      }
    } catch (e) {
      alert("Gagal memuat produk: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProduk();
  }, []);

  const kategoriList = useMemo(() => {
    const k = [
      ...new Set(produk.map((p) => p.kategori).filter(Boolean)),
    ].sort();
    return ["Semua", ...k];
  }, [produk]);

  const filteredSorted = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const filtered = produk.filter((p) => {
      const matchSearch =
        !keyword ||
        String(p.nama ?? "")
          .toLowerCase()
          .includes(keyword) ||
        String(p.barcode ?? "")
          .toLowerCase()
          .includes(keyword);
      const matchKategori =
        selectedKategori === "Semua" || p.kategori === selectedKategori;
      return matchSearch && matchKategori;
    });

    const key = sortKey;
    const dir = sortDir === "asc" ? 1 : -1;

    const getValue = (p) => {
      const v = p?.[key];
      if (key === "harga" || key === "harga_beli") return Number(v) || 0;
      if (key === "aktif") return v === true ? 1 : 0;
      return v ?? "";
    };

    filtered.sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);

      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * dir;
      }

      return String(va).localeCompare(String(vb)) * dir;
    });

    return filtered;
  }, [produk, search, selectedKategori, sortKey, sortDir]);

  function toggleSort(nextKey) {
    if (sortKey !== nextKey) {
      setSortKey(nextKey);
      setSortDir("asc");
      return;
    }
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  }

  function openCreate() {
    setModalMode("create");
    setModalForm({
      barcode: "",
      nama: "",
      harga: "",
      harga_beli: "",
      stok: 0,
      satuan: "",
      kategori: "",
      aktif: true,
    });
    setModalOpen(true);
  }

  function openEdit(p) {
    setModalMode("edit");
    setModalForm({
      barcode: String(p.barcode ?? ""),
      nama: String(p.nama ?? ""),
      harga: p.harga ?? "",
      harga_beli: p.harga_beli ?? "",
      stok: p.stok ?? 0,
      satuan: String(p.satuan ?? ""),
      kategori: String(p.kategori ?? ""),
      aktif: p.aktif === true,
    });
    setModalOpen(true);
  }

  async function uploadDraft() {
    if (!draftList || draftList.length === 0) {
      alert("List draft kosong");
      return;
    }

    setLoadingUpload(true);
    try {
      const res = await api.bulkCreateProduct(draftList);
      const { berhasil = [], gagal = [] } = res?.data || {};

      // Optimistic: tambah semua yang berhasil ke tabel
      setProduk((prev) => [
        ...prev,
        ...berhasil
          .map((b) =>
            draftList.find((d) => String(d.barcode) === String(b.barcode)),
          )
          .filter(Boolean),
      ]);

      if (gagal.length > 0) {
        // Bersihkan draft yang berhasil
        setDraftList((prev) =>
          prev.filter((d) =>
            gagal.some((g) => String(g.barcode) === String(d.barcode)),
          ),
        );

        alert(
          `${berhasil.length} produk berhasil, ${gagal.length} gagal:\n` +
            gagal.map((g) => `${g.barcode}: ${g.alasan}`).join("\n"),
        );
      } else {
        setDraftList([]);
        alert(`${berhasil.length} produk berhasil diunggah!`);
      }

      loadProduk();
    } catch (e) {
      alert("Gagal upload: " + e.message);
    } finally {
      setLoadingUpload(false);
    }
  }

  async function submitModal() {
    const f = modalForm;

    if (!f.nama || String(f.nama).trim() === "") {
      alert("Nama wajib diisi");
      return;
    }
    if (!f.barcode || String(f.barcode).trim() === "") {
      alert("Barcode wajib diisi");
      return;
    }
    if (f.harga === "" || Number(f.harga) <= 0) {
      alert("Harga wajib diisi");
      return;
    }
    if (f.harga_beli === "" || Number(f.harga_beli) < 0) {
      alert("Harga beli wajib diisi");
      return;
    }

    if (modalMode === "create") {
      const draftBarcode = String(f.barcode).trim();

      if (draftList.some((d) => String(d.barcode) === String(draftBarcode))) {
        alert("Barcode sudah ada di list draft");
        return;
      }

      setDraftList((prev) => [
        ...prev,
        {
          barcode: draftBarcode,
          nama: String(f.nama).trim(),
          harga: Number(f.harga),
          harga_beli: Number(f.harga_beli),
          stok: Number(f.stok) || 0,
          satuan: f.satuan,
          kategori: f.kategori,
          aktif: !!f.aktif,
        },
      ]);

      // Reset form (tetap modal terbuka)
      setModalForm({
        barcode: "",
        nama: "",
        harga: "",
        harga_beli: "",
        stok: 0,
        satuan: "",
        kategori: "",
        aktif: true,
      });
      setShowDraft(true);
      return;
    }

    // MODE EDIT: tetap langsung upload ke GAS
    try {
      await api.updateProduct({
        barcode: String(f.barcode).trim(),
        nama: String(f.nama).trim(),
        harga: Number(f.harga),
        harga_beli: Number(f.harga_beli),
        satuan: f.satuan,
        kategori: f.kategori,
        aktif: !!f.aktif,
      });

      // Optimistic update: langsung update item di state lokal
      setProduk((prev) =>
        prev.map((p) =>
          String(p.barcode) === String(f.barcode)
            ? {
                ...p,
                nama: f.nama,
                harga: Number(f.harga),
                harga_beli: Number(f.harga_beli),
                satuan: f.satuan,
                kategori: f.kategori,
                aktif: !!f.aktif,
              }
            : p,
        ),
      );

      setModalOpen(false);
      loadProduk();
      await loadProduk({ forceCacheInvalidate: true });
    } catch (e) {
      alert("Gagal menyimpan: " + e.message);
    }
  }

  async function onDelete(p) {
    const ok = window.confirm(
      `Hapus produk ${p.nama} (${p.barcode})?\n\nTindakan ini tidak bisa dibatalkan.`,
    );
    if (!ok) return;

    try {
      await api.deleteProduct(String(p.barcode));

      setProduk((prev) =>
        prev.filter((x) => String(x.barcode) !== String(p.barcode)),
      );

      loadProduk();
    } catch (e) {
      alert("Gagal menghapus: " + e.message);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-gray-800 text-xl">📋 Inventori</h2>
        {!editMode ? (
          <div className="flex items-center gap-2">
            <Btn onClick={openCreate}>➕ Tambah Produk</Btn>
            <Btn variant="outline" size="sm" onClick={enterEditMode}>
              ✏️ Edit Mode
            </Btn>
          </div>
        ) : (
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={cancelEditMode}>
              ❌ Batal
            </Btn>
            <Btn
              variant="success"
              size="sm"
              onClick={saveAllEdits}
              loading={loadingSave}
            >
              💾 Simpan Semua
            </Btn>
          </div>
        )}
      </div>

      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 flex gap-2 items-start">
            <div className="flex-1">
              <Input
                label={null}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Cari nama atau barcode..."
              />
            </div>
            <ScanBarcodeButton onScanned={(barcode) => setSearch(barcode)} />
          </div>

          <div className="flex flex-wrap gap-2 justify-start md:justify-end">
            {kategoriList.map((k) => {
              const active = selectedKategori === k;
              return (
                <button
                  key={k}
                  onClick={() => setSelectedKategori(k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
                    active
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-indigo-300"
                  }`}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4">&nbsp;</th>
                <Th
                  sortable
                  active={sortKey === "barcode"}
                  dir={sortDir}
                  onClick={() => toggleSort("barcode")}
                >
                  barcode{" "}
                  <SortIcon active={sortKey === "barcode"} dir={sortDir} />
                </Th>
                <Th
                  sortable
                  active={sortKey === "nama"}
                  dir={sortDir}
                  onClick={() => toggleSort("nama")}
                >
                  nama <SortIcon active={sortKey === "nama"} dir={sortDir} />
                </Th>
                <Th
                  sortable
                  active={sortKey === "harga"}
                  dir={sortDir}
                  onClick={() => toggleSort("harga")}
                >
                  harga <SortIcon active={sortKey === "harga"} dir={sortDir} />
                </Th>
                <Th
                  sortable
                  active={sortKey === "harga_beli"}
                  dir={sortDir}
                  onClick={() => toggleSort("harga_beli")}
                >
                  harga_beli{" "}
                  <SortIcon active={sortKey === "harga_beli"} dir={sortDir} />
                </Th>
                <Th>satuan</Th>
                <Th>kategori</Th>
                <Th>aktif</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8">
                    <div className="flex justify-center">
                      <Spinner size={32} />
                    </div>
                  </td>
                </tr>
              ) : filteredSorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8">
                    <EmptyState icon="📦" title="Produk tidak ditemukan" />
                  </td>
                </tr>
              ) : (
                filteredSorted.map((p) => {
                  return (
                    <tr key={p.barcode}>
                      <td className="py-3 pr-4">
                        {!editMode ? (
                          <div className="flex items-center gap-2">
                            <button
                              className="text-indigo-600 hover:text-indigo-800 text-lg"
                              onClick={() => openEdit(p)}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              className="text-red-600 hover:text-red-800 text-lg"
                              onClick={() => onDelete(p)}
                              title="Hapus"
                            >
                              🗑️
                            </button>
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 font-mono">{p.barcode}</td>
                      <td className="py-3 pr-4">
                        {editMode ? (
                          <input
                            value={editData[String(p.barcode)]?.nama || ""}
                            onChange={(e) => {
                              const val = e.target.value
                                .split(" ")
                                .map(
                                  (w) =>
                                    w.charAt(0).toUpperCase() +
                                    w.slice(1).toLowerCase(),
                                )
                                .join(" ");
                              setEditData((prev) => ({
                                ...prev,
                                [String(p.barcode)]: {
                                  ...prev[String(p.barcode)],
                                  nama: val,
                                },
                              }));
                            }}
                            className="w-full border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">
                              {p.nama}
                            </span>
                            {p.aktif === false ? (
                              <Badge color="gray">non-aktif</Badge>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-700">
                        {editMode ? (
                          <input
                            type="number"
                            value={editData[String(p.barcode)]?.harga ?? ""}
                            onChange={(e) => {
                              setEditData((prev) => ({
                                ...prev,
                                [String(p.barcode)]: {
                                  ...prev[String(p.barcode)],
                                  harga:
                                    e.target.value === ""
                                      ? ""
                                      : Number(e.target.value),
                                },
                              }));
                            }}
                            className="w-full border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        ) : (
                          rupiahFormat(p.harga)
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-700">
                        {editMode ? (
                          <input
                            type="number"
                            value={
                              editData[String(p.barcode)]?.harga_beli ?? ""
                            }
                            onChange={(e) => {
                              setEditData((prev) => ({
                                ...prev,
                                [String(p.barcode)]: {
                                  ...prev[String(p.barcode)],
                                  harga_beli:
                                    e.target.value === ""
                                      ? ""
                                      : Number(e.target.value),
                                },
                              }));
                            }}
                            className="w-full border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        ) : (
                          rupiahFormat(p.harga_beli)
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {editMode ? (
                          <input
                            value={editData[String(p.barcode)]?.satuan || ""}
                            onChange={(e) => {
                              const val = e.target.value.toLowerCase();
                              setEditData((prev) => ({
                                ...prev,
                                [String(p.barcode)]: {
                                  ...prev[String(p.barcode)],
                                  satuan: val,
                                },
                              }));
                            }}
                            className="w-full border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        ) : (
                          p.satuan
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {editMode ? (
                          <input
                            value={editData[String(p.barcode)]?.kategori || ""}
                            onChange={(e) => {
                              const val = e.target.value
                                .split(" ")
                                .map(
                                  (w) =>
                                    w.charAt(0).toUpperCase() +
                                    w.slice(1).toLowerCase(),
                                )
                                .join(" ");
                              setEditData((prev) => ({
                                ...prev,
                                [String(p.barcode)]: {
                                  ...prev[String(p.barcode)],
                                  kategori: val,
                                },
                              }));
                            }}
                            className="w-full border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        ) : (
                          <Badge color={KATEGORI_WARNA[p.kategori] || "gray"}>
                            {p.kategori}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {editMode ? (
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!editData[String(p.barcode)]?.aktif}
                              onChange={(e) => {
                                const val = !!e.target.checked;
                                setEditData((prev) => ({
                                  ...prev,
                                  [String(p.barcode)]: {
                                    ...prev[String(p.barcode)],
                                    aktif: val,
                                  },
                                }));
                              }}
                            />
                            <span className="text-sm font-semibold text-gray-700">
                              {editData[String(p.barcode)]?.aktif
                                ? "Aktif"
                                : "Non-aktif"}
                            </span>
                          </label>
                        ) : p.aktif === false ? (
                          <Badge color="gray">non-aktif</Badge>
                        ) : (
                          <Badge color="green">aktif</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-gray-400">
          Menampilkan {filteredSorted.length} dari {produk.length} produk
        </div>

        {draftList.length > 0 ? (
          <div className="mt-4 border border-dashed border-indigo-300 rounded-xl p-4 bg-indigo-50">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-indigo-700">
                📋 {draftList.length} produk siap diunggah
              </span>
              <div className="flex gap-2">
                <Btn variant="ghost" size="sm" onClick={() => setDraftList([])}>
                  Hapus Semua
                </Btn>
                <Btn
                  variant="primary"
                  size="sm"
                  onClick={uploadDraft}
                  loading={loadingUpload}
                >
                  ⬆️ Unggah Semua
                </Btn>
              </div>
            </div>

            {draftList.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-indigo-100 last:border-0 text-sm"
              >
                <div>
                  <span className="font-semibold">{p.nama}</span>
                  <span className="text-gray-400 ml-2 font-mono text-xs">
                    {p.barcode}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-indigo-600 font-semibold">
                    {rupiahFormat(p.harga)}
                  </span>
                  <button
                    onClick={() =>
                      setDraftList((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="text-red-400 hover:text-red-600 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === "create" ? "Tambah Produk" : "Edit Produk"}
        width="max-w-2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitModal();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Barcode
              </label>
              <div className="flex gap-2">
                <input
                  value={modalForm.barcode}
                  onChange={(e) =>
                    setModalForm((s) => ({ ...s, barcode: e.target.value }))
                  }
                  disabled={modalMode === "edit"}
                  placeholder="contoh: 899123..."
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-400
                             focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                />
                {modalMode === "create" && (
                  <ScanBarcodeButton
                    onScanned={(barcode) =>
                      setModalForm((s) => ({ ...s, barcode }))
                    }
                  />
                )}
              </div>
            </div>
            <Input
              label="Nama"
              value={modalForm.nama}
              onChange={(e) => {
                const val = e.target.value
                  .split(" ")
                  .map(
                    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
                  )
                  .join(" ");
                setModalForm((f) => ({ ...f, nama: val }));
              }}
              placeholder="Nama produk"
              required
            />

            <Input
              label="Harga"
              type="number"
              value={modalForm.harga}
              onChange={(e) =>
                setModalForm((s) => ({ ...s, harga: e.target.value }))
              }
              placeholder="0"
              required
            />
            <Input
              label="Harga Beli"
              type="number"
              value={modalForm.harga_beli}
              onChange={(e) =>
                setModalForm((s) => ({ ...s, harga_beli: e.target.value }))
              }
              placeholder="0"
              required
            />

            {!modalMode || modalMode === "create" ? (
              <Input
                label="Stok Awal"
                type="number"
                value={modalForm.stok}
                onChange={(e) =>
                  setModalForm((f) => ({ ...f, stok: e.target.value }))
                }
                placeholder="0"
              />
            ) : null}

            <Input
              label="Satuan"
              value={modalForm.satuan}
              onChange={(e) => {
                const val = e.target.value.toLowerCase();
                setModalForm((f) => ({ ...f, satuan: val }));
              }}
              placeholder="pcs/kg"
            />
            <Input
              label="Kategori"
              value={modalForm.kategori}
              onChange={(e) => {
                const val = e.target.value
                  .split(" ")
                  .map(
                    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
                  )
                  .join(" ");
                setModalForm((f) => ({ ...f, kategori: val }));
              }}
              placeholder="Sembako/Bumbu/..."
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-800">Aktif</div>
              <div className="text-xs text-gray-400">
                Produk aktif muncul di pencarian & pemakaian kasir
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!modalForm.aktif}
                onChange={(e) =>
                  setModalForm((s) => ({ ...s, aktif: e.target.checked }))
                }
              />
              <span className="text-sm font-semibold text-gray-700">
                {modalForm.aktif ? "Aktif" : "Non-aktif"}
              </span>
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <Btn
              variant="ghost"
              className="flex-1"
              onClick={() => setModalOpen(false)}
            >
              Selesai
            </Btn>
            <Btn
              ref={modalSubmitRef}
              variant="primary"
              className="flex-1"
              type="submit"
            >
              {modalMode === "create" ? "Tambah ke List" : "Simpan Perubahan"}
            </Btn>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Th({ children, sortable = false, onClick, active, dir }) {
  return (
    <th
      className={`py-2 pr-4 font-semibold ${sortable ? "cursor-pointer select-none" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span>{children}</span>
      </div>
    </th>
  );
}

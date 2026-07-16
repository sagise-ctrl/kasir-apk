import {
  cacheProducts,
  getCachedProducts,
  getCachedProduct,
  searchCachedProducts,
  addToSyncQueue,
  cacheHutang,
  getCachedHutang,
  getHutangByPelanggan,
} from "./db";
import { isOnline } from "./networkStatus";

const BASE_URL =
  "https://script.google.com/macros/s/AKfycbwVEHwdCKAa2w9fbthBbgZpy3ic2vCWwuypQZqKckilKnAbfFaT-MnGrRaHnSypLbraYw/exec";

// ─── GET request ─────────────────────────────────────────────────────────────
async function get(params) {
  const url = new URL(BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ─── POST request ─────────────────────────────────────────────────────────────
async function post(body) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export const api = {
  // ── Produk ────────────────────────────────────────────────────────────────

  // Ambil 1 produk — online: dari GAS, offline: dari cache
  getProduct: async (barcode) => {
    if (isOnline()) {
      return await get({ action: "getProduct", barcode });
    }
    const cached = await getCachedProduct(barcode);
    if (!cached) throw new Error("Produk tidak ditemukan (offline)");
    return { success: true, data: cached };
  },

  // Cari produk — selalu dari cache (instan < 100ms)
  searchProduct: async (q) => {
    // Selalu search dari cache (online maupun offline)
    // Cache sudah fresh karena diisi saat app buka via getAllProducts
    const results = await searchCachedProducts(q);
    return { success: true, data: results };
  },

  // Ambil semua produk — online: dari GAS + update cache, offline: dari cache
  getAllProducts: async () => {
    if (isOnline()) {
      const data = await get({ action: "getAllProducts" });
      const products = Array.isArray(data)
        ? data
        : data.data || data.products || [];
      if (products.length > 0) {
        // Normalisasi: pastikan barcode selalu string
        const normalized = products.map((p) => ({
          ...p,
          barcode: String(p.barcode),
          stok: Number(p.stok) || 0,
        }));
        await cacheProducts(normalized);
      }
      return data;
    }
    // Offline — pakai cache
    const cached = await getCachedProducts();
    if (cached.length === 0)
      throw new Error(
        "Belum ada data produk offline. Buka aplikasi saat online terlebih dahulu.",
      );
    return { success: true, data: cached };
  },

  // ── Pelanggan ──────────────────────────────────────────────────────────────

  searchPelanggan: async (q = "") => {
    if (!isOnline())
      throw new Error("Pencarian pelanggan membutuhkan koneksi internet");
    return await get({ action: "searchPelanggan", q });
  },

  createPelanggan: async (body) => {
    if (!isOnline())
      throw new Error("Tambah pelanggan membutuhkan koneksi internet");
    return await post({ action: "createPelanggan", ...body });
  },

  // ── Transaksi ──────────────────────────────────────────────────────────────

  createTransaction: async (body) => {
    if (isOnline()) {
      // Online — langsung kirim ke GAS
      return await post({ action: "createTransaction", ...body });
    }
    // Offline — simpan ke sync queue
    await addToSyncQueue("createTransaction", body);
    return {
      success: true,
      offline: true,
      message: "Transaksi disimpan, akan sync otomatis saat online",
    };
  },

  // ── Hutang ────────────────────────────────────────────────────────────────

  getHutangPelanggan: async (id) => {
    if (isOnline()) {
      return await get({ action: "getHutangPelanggan", id });
    }
    // Offline — filter dari cache by id_pelanggan
    const cached = await getHutangByPelanggan(id);
    if (cached.length === 0)
      throw new Error("Data hutang tidak ditemukan (offline)");
    return cached;
  },

  getAllHutang: async () => {
    if (isOnline()) {
      const data = await get({ action: "getAllHutang" });
      // Simpan ke cache setiap kali berhasil fetch online
      const hutangData = Array.isArray(data) ? data : data.hutang || [];
      if (hutangData.length > 0) await cacheHutang(hutangData);
      return data;
    }
    // Offline — pakai cache
    const cached = await getCachedHutang();
    return cached;
  },

  bayarCicilan: async (body) => {
    if (isOnline()) {
      return await post({ action: "bayarCicilan", ...body });
    }
    // Offline — masuk queue
    await addToSyncQueue("bayarCicilan", body);
    return {
      success: true,
      offline: true,
      message: "Pembayaran disimpan, akan sync otomatis saat online",
    };
  },

  // ── Laporan ───────────────────────────────────────────────────────────────

  getDailyReport: async (tgl) => {
    if (!isOnline()) throw new Error("Laporan membutuhkan koneksi internet");
    return await get({ action: "getDailyReport", ...(tgl ? { tgl } : {}) });
  },

  getTren7Hari: async (tgl) => {
    if (!isOnline())
      throw new Error("Tren 7 hari membutuhkan koneksi internet");
    return await get({ action: "getTren7Hari", tgl });
  },

  getKomposisiHariIni: async (tgl) => {
    if (!isOnline()) throw new Error("Membutuhkan koneksi internet");
    return await get({ action: "getKomposisiHariIni", tgl });
  },

  // ── Stok ──────────────────────────────────────────────────────────────────

  updateStok: async (barcode, tipe, jumlah) => {
    if (isOnline()) {
      return await post({ action: "updateStok", barcode, jumlah, tipe });
    }
    // Offline — masuk queue
    await addToSyncQueue("updateStok", { barcode, tipe, jumlah });
    return {
      success: true,
      offline: true,
      message: "Update stok disimpan, akan sync otomatis saat online",
    };
  },

  // ── Inventori (CRUD Produk) ─────────────────────────────────────────

  createProduct: async (body) => {
    if (!isOnline()) throw new Error("Membutuhkan koneksi internet");
    return await post({ action: "createProduct", ...body });
  },

  updateProduct: async (body) => {
    if (!isOnline()) throw new Error("Membutuhkan koneksi internet");
    return await post({ action: "updateProduct", ...body });
  },

  bulkCreateProduct: async (products) => {
    if (!isOnline()) throw new Error("Membutuhkan koneksi internet");
    return await post({ action: "bulkCreateProduct", products });
  },

  bulkUpdateProduct: async (products) => {
    if (!isOnline()) throw new Error("Membutuhkan koneksi internet");
    return await post({ action: "bulkUpdateProduct", products });
  },

  deleteProduct: async (barcode) => {
    if (!isOnline()) throw new Error("Membutuhkan koneksi internet");
    return await post({ action: "deleteProduct", barcode });
  },
};

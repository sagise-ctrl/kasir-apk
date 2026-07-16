import Dexie from "dexie";

// ─── Database lokal (IndexedDB via Dexie) ───────────────────────────────────
export const db = new Dexie("KasirDB");

db.version(1).stores({
  // Cache produk dari GSheets
  // barcode = primary key
  products: "barcode, nama, kategori, stok",

  // Antrian transaksi & operasi yang belum sync ke GSheets
  // ++id = auto-increment primary key
  syncQueue: "++id, action, status, createdAt",

  // Cache hutang dari GSheets
  // ++id = auto-increment primary key
  hutang: "++id, id_pelanggan, nama_pelanggan, status",
});

// ─── Helper: simpan semua produk ke cache lokal ──────────────────────────────
export async function cacheProducts(products) {
  await db.products.clear();
  await db.products.bulkPut(products);
}

// ─── Helper: ambil semua produk dari cache lokal ─────────────────────────────
export async function getCachedProducts() {
  return await db.products.toArray();
}

// ─── Helper: ambil 1 produk dari cache berdasarkan barcode ───────────────────
export async function getCachedProduct(barcode) {
  return await db.products.get(barcode);
}

// ─── Helper: cari produk di cache lokal ──────────────────────────────────────
export async function searchCachedProducts(q) {
  const keyword = q.toLowerCase();
  return await db.products
    .filter(
      (p) =>
        p.nama?.toLowerCase().includes(keyword) ||
        p.barcode?.toLowerCase().includes(keyword),
    )
    .toArray();
}

// ─── Helper: tambah operasi ke sync queue ────────────────────────────────────
export async function addToSyncQueue(action, payload) {
  await db.syncQueue.add({
    action,
    payload,
    status: "pending", // pending | syncing | done | failed
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
}

// ─── Helper: ambil semua yang masih pending ───────────────────────────────────
export async function getPendingQueue() {
  return await db.syncQueue.where("status").equals("pending").toArray();
}

// ─── Helper: tandai item queue sebagai done ───────────────────────────────────
export async function markQueueDone(id) {
  await db.syncQueue.delete(id);
}

// ─── Helper: tandai item queue sebagai failed ────────────────────────────────
export async function markQueueFailed(id, error) {
  await db.syncQueue.update(id, {
    status: "failed",
    error: error?.message || String(error),
    retryCount: (await db.syncQueue.get(id))?.retryCount + 1 || 1,
  });
}

// ─── Helper: simpan semua hutang ke cache lokal ──────────────────────────────
export async function cacheHutang(hutangData) {
  await db.hutang.clear();
  await db.hutang.bulkPut(hutangData);
}

// ─── Helper: ambil semua hutang dari cache lokal ─────────────────────────────
export async function getCachedHutang() {
  return await db.hutang.toArray();
}

// ─── Helper: cari hutang berdasarkan id_pelanggan ────────────────────────────
export async function getHutangByPelanggan(id_pelanggan) {
  return await db.hutang.where("id_pelanggan").equals(id_pelanggan).toArray();
}

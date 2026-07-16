import { useState } from "react";

import { CariProduk } from "../components/CariProduk";
import { Keranjang } from "../components/Keranjang";
import { ModalBayar } from "../components/ModalBayar";
import { useKeranjang } from "../context/KeranjangContext";

export function HalamanKasir() {
  const [modalBayar, setModalBayar] = useState(false);
  const [viewMobile, setViewMobile] = useState("cari"); // "cari" | "keranjang"
  const [queryCari, setQueryCari] = useState("");
  const { items, dispatch } = useKeranjang();

  function tambahProduk(produk) {
    dispatch({ type: "TAMBAH", produk });
    // Di mobile, pindah ke keranjang setelah tambah
    if (window.innerWidth < 768) setViewMobile("keranjang");
  }

  return (
    <div className="h-full flex flex-col">
      {/* Mobile tab switcher */}
      <div className="md:hidden flex border-b border-gray-100 bg-white">
        {[
          { key: "cari", label: "🔍 Cari Produk" },
          { key: "keranjang", label: `🛒 Keranjang (${items.length})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setViewMobile(t.key)}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              viewMobile === t.key
                ? "text-indigo-600 border-b-2 border-indigo-600"
                : "text-gray-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Desktop: 2 kolom | Mobile: 1 kolom */}
      <div className="flex-1 flex overflow-visible">
        {/* Kiri — cari produk */}
        <div
          className={`flex flex-col flex-1 overflow-visible p-4 gap-4
            ${viewMobile === "keranjang" ? "hidden md:flex" : "flex"}`}
        >
          <CariProduk onPilih={tambahProduk} onQueryChange={setQueryCari} />

          {/* Foto kasir + motivasi (hanya saat belum ada produk di keranjang & belum mengetik) */}
          {items.length === 0 && queryCari.trim().length === 0 && (
            <div className="hidden md:flex flex-row items-center gap-6 mt-4">
              {/* Foto kiri */}
              <div className="relative w-48 shrink-0">
                <img
                  src="/kasie-photo.png"
                  alt="Kasir"
                  className="w-full object-contain"
                />
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-gray-50 to-transparent" />
              </div>

              {/* Teks kanan */}
              <div className="flex flex-col justify-center">
                <p className="text-gray-400 text-lg leading-relaxed italic">
                  Tetap semangat menjalani hari ini.
                  <br />
                  Layani pelanggan dengan ramah dan
                  <br />
                  lakukan setiap transaksi dengan teliti.
                </p>
              </div>
            </div>
          )}

          {/* Hint */}
        </div>

        {/* Divider desktop */}
        <div className="hidden md:block w-px bg-gray-100" />

        {/* Kanan — keranjang */}
        <div
          className={`flex flex-col overflow-hidden p-4
            w-full md:w-96 lg:w-[420px]
            ${viewMobile === "cari" ? "hidden md:flex" : "flex"}`}
        >
          <div className="flex-1 overflow-y-auto">
            <Keranjang onBayar={() => setModalBayar(true)} />
          </div>
        </div>
      </div>

      <ModalBayar
        open={modalBayar}
        onClose={() => setModalBayar(false)}
        onSelesai={() => setViewMobile("cari")}
      />
    </div>
  );
}

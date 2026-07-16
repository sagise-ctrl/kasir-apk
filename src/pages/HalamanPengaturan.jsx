import { useState, useEffect } from "react";
import { Card, Btn, Input } from "../components/UI";
import { HalamanPengaturanPrinter } from "./HalamanPengaturanPrinter";

export function HalamanPengaturan() {
  const [nama, setNama] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setNama(localStorage.getItem("kasir_nama") || "");
  }, []);

  function simpan() {
    localStorage.setItem("kasir_nama", nama.trim() || "Kasir");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="p-4 md:p-6 max-w-md mx-auto space-y-5">
      <h2 className="font-black text-gray-800 text-xl">⚙️ Pengaturan</h2>

      <Card className="p-5 space-y-4">
        <h3 className="font-bold text-gray-700">Identitas Kasir</h3>
        <Input
          label="Nama Kasir"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Masukkan nama kasir..."
        />
        <Btn
          variant={saved ? "success" : "primary"}
          onClick={simpan}
          className="w-full"
        >
          {saved ? "✅ Tersimpan!" : "Simpan"}
        </Btn>
      </Card>

      <HalamanPengaturanPrinter />

      <Card className="p-5 space-y-3">
        <h3 className="font-bold text-gray-700">Info Sistem</h3>
        <div className="text-sm text-gray-500 space-y-2">
          <div className="flex justify-between">
            <span>Versi</span>
            <span className="font-semibold text-gray-700">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span>Backend</span>
            <span className="font-semibold text-gray-700">
              Google Apps Script
            </span>
          </div>
          <div className="flex justify-between">
            <span>Database</span>
            <span className="font-semibold text-gray-700">Google Sheets</span>
          </div>
          <div className="flex justify-between">
            <span>QRIS</span>
            <span className="font-semibold text-amber-500">Belum aktif</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

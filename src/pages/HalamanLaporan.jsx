import { useState, useEffect } from "react";
import { api } from "../utils/api";
import {
  rupiahFormat,
  tglFormat,
  jamFormat,
  tglInputFormat,
} from "../utils/format";
import { Card, Spinner, EmptyState } from "../components/UI";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";

const WARNA_KOMPOSISI = {
  Cash: "#22c55e",
  QRIS: "#3b82f6",
  Cicilan: "#f59e0b",
  Tempo: "#ef4444",
};

export function HalamanLaporan() {
  const [tgl, setTgl] = useState(tglInputFormat());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tren7Hari, setTren7Hari] = useState([]);
  const [komposisi, setKomposisi] = useState([]);
  const [loadingGrafik, setLoadingGrafik] = useState(false);

  async function load(t) {
    setLoading(true);
    try {
      const res = await api.getDailyReport(t);
      setData(res.data);
    } catch (e) {
      alert("Gagal: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadGrafik() {
    setLoadingGrafik(true);
    try {
      const [trenRes, kompRes] = await Promise.all([
        api.getTren7Hari(tgl),
        api.getKomposisiHariIni(tgl),
      ]);
      const tren = trenRes.data || [];
      // Normalisasi angka agar recharts terbaca (khususnya laba)
      // (termasuk bila field laba/omzet berupa string atau undefined)
      const normalizedTren = tren.map((x) => {
        const omzet = Number(x.omzet);
        const laba = Number(x.laba);
        return {
          ...x,
          omzet: Number.isFinite(omzet) ? omzet : 0,
          laba: Number.isFinite(laba) ? laba : 0,
        };
      });

      setTren7Hari(normalizedTren);
      // Debug singkat: kalau laba 0 terus, akan terlihat di console
      console.log("[Laporan] Tren7Hari sample:", normalizedTren.slice(0, 3));
      setKomposisi(kompRes.data || []);
    } catch (e) {
      console.error("Gagal load grafik:", e.message);
    } finally {
      setLoadingGrafik(false);
    }
  }

  useEffect(() => {
    load(tgl);
    loadGrafik();
  }, [tgl]);

  const r = data?.ringkasan;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Pilih tanggal */}
      <div className="flex items-center gap-3">
        <h2 className="font-black text-gray-800 text-xl flex-1">
          📊 Laporan Harian
        </h2>
        <input
          type="date"
          value={tgl}
          onChange={(e) => setTgl(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={32} />
        </div>
      ) : !data ? null : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <SumCard
              label="Total Omzet"
              value={rupiahFormat(r.total_omzet)}
              color="indigo"
              icon="💰"
            />
            <SumCard
              label="Cash Masuk"
              value={rupiahFormat(r.cash_masuk)}
              color="green"
              icon="💵"
            />
            <SumCard
              label="Cicilan Masuk"
              value={rupiahFormat(r.cicilan_masuk)}
              color="blue"
              icon="🔄"
            />
            <SumCard
              label="Hutang Baru"
              value={rupiahFormat(r.hutang_baru)}
              color="red"
              icon="📋"
            />
            <SumCard
              label="Jml Transaksi"
              value={r.jumlah_trx + " trx"}
              color="purple"
              icon="🧾"
            />
            <SumCard
              label="Laba Kotor"
              value={rupiahFormat(r.total_laba || 0)}
              color="green"
              icon="💰"
            />
          </div>

          {/* Grafik Tren 7 Hari */}
          <Card className="p-4">
            <h3 className="font-bold text-gray-700 mb-4">
              📈 Tren 7 Hari Terakhir
            </h3>
            {loadingGrafik ? (
              <div className="flex justify-center py-8">
                <Spinner size={24} />
              </div>
            ) : tren7Hari.length === 0 ? (
              <EmptyState icon="📈" title="Belum ada data tren" />
            ) : (
              <div className="w-full" style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height={250} minHeight={250}>
                  <LineChart
                    data={tren7Hari}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="hari"
                      tick={{ fontSize: 12 }}
                      stroke="#9ca3af"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="#9ca3af"
                      domain={[0, 3000000]}
                      ticks={[0, 100000, 500000, 1000000, 2000000, 3000000]}
                      tickFormatter={(value) => {
                        if (value === 0) return "0";
                        if (value >= 1000000) return value / 1000000 + "jt";
                        if (value >= 1000) return value / 1000 + "k";
                        return value;
                      }}
                    />
                    <Tooltip
                      formatter={(value) => rupiahFormat(value)}
                      contentStyle={{
                        borderRadius: 8,
                        border: "none",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="omzet"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      name="Omzet"
                    />
                    <Line
                      type="monotone"
                      dataKey="laba"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      name="Laba"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Grafik Komposisi Penjualan */}
          <Card className="p-4">
            <h3 className="font-bold text-gray-700 mb-4">
              📊 Komposisi Penjualan Hari Ini
            </h3>
            {loadingGrafik ? (
              <div className="flex justify-center py-8">
                <Spinner size={24} />
              </div>
            ) : komposisi.length === 0 ? (
              <EmptyState icon="📊" title="Belum ada data komposisi" />
            ) : (
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div
                  className="w-full md:w-1/2 relative"
                  style={{ height: 220 }}
                >
                  {/* Teks total di tengah donut */}
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      textAlign: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <div className="text-xs text-gray-400">Total</div>
                    <div className="text-sm font-bold text-gray-800">
                      {rupiahFormat(
                        komposisi.reduce((sum, k) => sum + (k.nilai || 0), 0),
                      )}
                    </div>
                  </div>
                  <ResponsiveContainer
                    width="100%"
                    height={220}
                    minHeight={220}
                  >
                    <PieChart>
                      <Pie
                        data={
                          komposisi.filter((k) => k.nilai > 0).length > 0
                            ? komposisi.filter((k) => k.nilai > 0)
                            : [{ nama: "Belum ada", nilai: 1 }]
                        }
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="nilai"
                        nameKey="nama"
                        labelLine={false}
                      >
                        {komposisi
                          .filter((k) => k.nilai > 0)
                          .map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={WARNA_KOMPOSISI[entry.nama] || "#e5e7eb"}
                            />
                          ))}
                      </Pie>
                      <Tooltip formatter={(value) => rupiahFormat(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full md:w-1/2 space-y-3">
                  {komposisi.map((k) => (
                    <div key={k.nama} className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: WARNA_KOMPOSISI[k.nama] || "#9ca3af",
                        }}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-gray-700">
                          {k.nama}
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(k.nilai / (komposisi.reduce((s, x) => s + x.nilai, 0) || 1)) * 100}%`,
                              backgroundColor:
                                WARNA_KOMPOSISI[k.nama] || "#9ca3af",
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-sm font-bold text-gray-800">
                        {rupiahFormat(k.nilai)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Daftar transaksi */}
          <div>
            <h3 className="font-bold text-gray-700 mb-3">Daftar Transaksi</h3>
            {data.transaksi.length === 0 ? (
              <EmptyState
                icon="🧾"
                title="Belum ada transaksi"
                desc={`Tanggal ${tgl}`}
              />
            ) : (
              <div className="space-y-2">
                {data.transaksi.map((t) => (
                  <Card key={t.id_trx} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm text-gray-800">
                          {t.id_trx}
                        </div>
                        <div className="text-xs text-gray-400">
                          {jamFormat(t.tgl)} · {t.kasir} ·{" "}
                          <span
                            className={
                              t.metode_bayar === "tempo"
                                ? "text-orange-500"
                                : "text-green-500"
                            }
                          >
                            {t.metode_bayar}
                          </span>
                        </div>
                      </div>
                      <div className="font-bold text-gray-800">
                        {rupiahFormat(t.total)}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Hutang baru hari ini */}
          {data.hutang_baru.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-700 mb-3">
                Hutang Baru Hari Ini
              </h3>
              <div className="space-y-2">
                {data.hutang_baru.map((h) => (
                  <Card key={h.id_hutang} className="px-4 py-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-sm">
                          {h.id_pelanggan}
                        </div>
                        <div className="text-xs text-gray-400">
                          {h.id_hutang}
                        </div>
                      </div>
                      <div className="font-bold text-red-500">
                        {rupiahFormat(h.total_hutang)}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Cicilan hari ini */}
          {data.cicilan.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-700 mb-3">
                Cicilan Diterima Hari Ini
              </h3>
              <div className="space-y-2">
                {data.cicilan.map((c) => (
                  <Card key={c.id_cicilan} className="px-4 py-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-sm">
                          {c.id_pelanggan}
                        </div>
                        <div className="text-xs text-gray-400">
                          {jamFormat(c.tgl_bayar)} · {c.metode}
                        </div>
                      </div>
                      <div className="font-bold text-emerald-600">
                        {rupiahFormat(c.jumlah)}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SumCard({ label, value, color, icon }) {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-700",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <div className={`rounded-2xl p-4 ${colors[color]}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs opacity-70 mb-0.5">{label}</div>
      <div className="font-black text-lg leading-tight">{value}</div>
    </div>
  );
}

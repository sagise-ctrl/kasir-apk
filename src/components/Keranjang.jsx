import { useKeranjang } from "../context/KeranjangContext";
import { rupiahFormat } from "../utils/format";
import { Btn } from "./UI";

export function Keranjang({ onBayar }) {
  const { items, subtotal, total, diskon, dispatch } = useKeranjang();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-gray-300">
        <div className="text-6xl mb-3">🛒</div>
        <div className="font-semibold text-gray-400">Keranjang kosong</div>
        <div className="text-sm text-gray-300 mt-1">
          Scan atau cari produk di atas
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Item list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {items.map((item) => (
          <KeranjangItem key={item.barcode} item={item} dispatch={dispatch} />
        ))}
      </div>

      {/* Summary */}
      <div className="border-t border-gray-100 pt-4 mt-4 space-y-2">
        {/* Diskon */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 flex-1">Diskon</span>
          <input
            type="number"
            value={diskon || ""}
            onChange={(e) =>
              dispatch({
                type: "SET_DISKON",
                diskon: parseInt(e.target.value) || 0,
              })
            }
            placeholder="0"
            className="w-32 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right
                       focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div className="flex justify-between text-sm text-gray-500">
          <span>Subtotal</span>
          <span>{rupiahFormat(subtotal)}</span>
        </div>

        <div className="flex justify-between font-bold text-lg text-gray-800">
          <span>Total</span>
          <span className="text-indigo-600">{rupiahFormat(total)}</span>
        </div>

        <div className="flex gap-2 pt-2">
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "KOSONGKAN" })}
          >
            🗑 Kosongkan
          </Btn>
          <Btn
            variant="success"
            size="lg"
            className="flex-1"
            onClick={onBayar}
            disabled={items.length === 0}
          >
            💳 Bayar {rupiahFormat(total)}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function KeranjangItem({ item, dispatch }) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-gray-800 truncate">
          {item.nama}
        </div>
        <div className="text-xs text-gray-400">
          {rupiahFormat(item.harga)} / {item.satuan}
        </div>
      </div>

      {/* Qty control */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => dispatch({ type: "KURANGI", barcode: item.barcode })}
          className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-600
                     hover:bg-red-50 hover:border-red-200 hover:text-red-500
                     flex items-center justify-center text-sm font-bold transition-colors"
        >
          −
        </button>
        <input
          type="number"
          value={item.qty}
          min={1}
          max={Number(item.stok) || undefined}
          onChange={(e) =>
            dispatch({
              type: "SET_QTY",
              barcode: item.barcode,
              qty: parseInt(e.target.value) || 1,
            })
          }
          className="w-10 text-center text-sm font-semibold border border-gray-200
                     rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          onClick={() => dispatch({ type: "TAMBAH", produk: item })}
          className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-600
                     hover:bg-green-50 hover:border-green-200 hover:text-green-500
                     flex items-center justify-center text-sm font-bold transition-colors"
        >
          +
        </button>
      </div>

      <div className="text-right w-20">
        <div className="font-bold text-sm text-gray-800">
          {rupiahFormat(item.harga * item.qty)}
        </div>
        <button
          onClick={() => dispatch({ type: "HAPUS", barcode: item.barcode })}
          className="text-xs text-red-400 hover:text-red-600"
        >
          hapus
        </button>
      </div>
    </div>
  );
}

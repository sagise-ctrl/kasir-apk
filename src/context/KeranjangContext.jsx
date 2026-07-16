import { createContext, useContext, useReducer } from "react";

const KeranjangContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case "TAMBAH": {
      const produk = action.produk;
      const maxQty = Math.max(0, Number(produk?.stok) || 0);
      if (maxQty <= 0) return state;

      const existing = state.items.findIndex(
        (i) => i.barcode === produk.barcode,
      );

      if (existing >= 0) {
        const items = [...state.items];
        const current = items[existing];
        const nextQty = Math.min(maxQty, (current.qty || 0) + 1);
        items[existing] = { ...current, qty: nextQty };
        return { ...state, items: items.filter((i) => i.qty > 0) };
      }

      return {
        ...state,
        items: [...state.items, { ...produk, qty: 1 }],
      };
    }
    case "KURANGI": {
      const items = state.items
        .map((i) =>
          i.barcode === action.barcode ? { ...i, qty: i.qty - 1 } : i,
        )
        .filter((i) => i.qty > 0);
      return { ...state, items };
    }
    case "HAPUS": {
      return {
        ...state,
        items: state.items.filter((i) => i.barcode !== action.barcode),
      };
    }
    case "SET_QTY": {
      const requested = Number(action.qty) || 0;

      const items = state.items
        .map((i) => {
          if (i.barcode !== action.barcode) return i;

          const maxQty = Math.max(0, Number(i.stok) || 0);
          if (maxQty <= 0) return { ...i, qty: 0 };

          const nextQty = Math.min(maxQty, requested);
          return { ...i, qty: nextQty };
        })
        .filter((i) => i.qty > 0);

      return { ...state, items };
    }
    case "KOSONGKAN":
      return { ...state, items: [], diskon: 0 };
    case "SET_DISKON":
      return { ...state, diskon: action.diskon };
    default:
      return state;
  }
}

export function KeranjangProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, { items: [], diskon: 0 });

  const subtotal = state.items.reduce((sum, i) => sum + i.harga * i.qty, 0);
  const total = subtotal - (state.diskon || 0);

  return (
    <KeranjangContext.Provider value={{ ...state, subtotal, total, dispatch }}>
      {children}
    </KeranjangContext.Provider>
  );
}

export function useKeranjang() {
  return useContext(KeranjangContext);
}

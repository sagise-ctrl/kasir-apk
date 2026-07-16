import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tokoan.kasir",
  appName: "Kasir",
  // Matches vite.config.ts build.outDir (relative to this file).
  webDir: "dist/public",
  plugins: {
    MlkitBarcodeScanner: {
      path: "plugins/mlkit-barcode-scanner",
    },
    ThermalPrinter: {
      path: "plugins/thermal-printer",
    },
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;

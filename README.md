# Kasir Android

Standalone native Android project for the Kasir POS app, built with
[Capacitor](https://capacitorjs.com) and a local native plugin for fast,
sensitive barcode scanning (Google ML Kit + CameraX) instead of the browser
camera used by the PWA.

## Why a native app instead of the PWA?

The web version scans barcodes with a browser camera feed (ZXing +
`getUserMedia`). That works, but browser camera access is throttled and the
autofocus/exposure controls browsers expose are limited, so scanning can feel
slow or miss barcodes.

The Android app instead uses a local Capacitor plugin
(`plugins/mlkit-barcode-scanner`) that opens a native full-screen camera
activity backed by **CameraX + Google ML Kit Barcode Scanning**. ML Kit runs
on-device, frame-by-frame, with no browser throttling — scanning is
noticeably faster and more sensitive, especially for damaged/small barcodes.

`src/components/BarcodeScanner.jsx` already contains the branching logic:
- In the browser → uses ZXing (`startCameraWeb`), unchanged.
- Inside the Android app (`Capacitor.isNativePlatform()` is true) → calls the
  native plugin (`startScanAndroidNative`) instead.

No other app code changes: the barcode string flows into the same
`onBarcodeDetected` callback either way.

## What was added

- `capacitor.config.ts` — Capacitor app config (`appId: com.tokoan.kasir`,
  `webDir: dist/public`, registers the local plugin).
- `plugins/mlkit-barcode-scanner/` — local Capacitor plugin:
  - `android/` — the native Android module (Java): `MlkitBarcodeScannerPlugin`
    + `CameraActivity` (CameraX preview + ML Kit analyzer).
  - `src/index.ts` / `dist/` — the plugin's JS interface (`registerPlugin`).
- `src/native/mlkit-barcode-scanner.ts` — the same plugin interface imported
  by the web bundle (kept local so the web build has no dependency on the
  `android/` folder).
- `android/` — the generated native Android project (Gradle). Committed so
  CI can build it directly; build outputs (`android/app/build`, `.gradle/`,
  `local.properties`) are gitignored.
- `.github/workflows/android-build.yml` — GitHub Actions workflow that
  installs deps, builds the web bundle, runs `cap sync android`, and produces
  a debug `.apk` as a workflow artifact (optionally a signed release APK if
  keystore secrets are configured — see the workflow file for the secret
  names).

## Building locally (if you have Android Studio / the Android SDK + JDK 21)

```bash
# from artifacts/kasir
pnpm install
pnpm run android:sync          # builds the web app, then `cap sync android`
cd android
./gradlew assembleDebug         # -> android/app/build/outputs/apk/debug/app-debug.apk
```

Or open the `android/` folder directly in Android Studio after running
`pnpm run android:sync` once.

## Building via GitHub Actions (no local Android setup needed)

Push this repo to GitHub and either:
- push to `main` with changes under `artifacts/kasir/**`, or
- trigger the **"Build Kasir Android APK"** workflow manually from the
  Actions tab (`workflow_dispatch`).

The debug APK is uploaded as a workflow artifact you can download and
install on a device (`adb install app-debug.apk`, or transfer + tap to
install with "install unknown apps" allowed).

To get a signed release APK instead of debug-only, add these repo secrets
(Settings → Secrets and variables → Actions):
- `ANDROID_KEYSTORE_BASE64` — `base64 -w0 your.keystore`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

## Notes / things to double check on a real device

- Camera permission is declared in `android/app/src/main/AndroidManifest.xml`
  and requested at runtime via `MlkitBarcodeScanner.requestCameraPermission()`
  before `startScan()` is called — make sure the UI calls it once (the
  existing `useBarcodeScanner` hook's `startScanning()` already does this
  flow on native).
- App id is `com.tokoan.kasir` and app name is "Kasir" — change both in
  `capacitor.config.ts` (and `android/app/build.gradle`'s `applicationId`,
  regenerate via `cap sync`) if you want a different package name before
  publishing.
- The app icon currently uses Capacitor's default icon. Replace
  `android/app/src/main/res/mipmap-*/ic_launcher*.png` with your own (or use
  `@capacitor/assets` locally) before a real release.
- This app is offline-first and talks to the same Google Apps Script backend
  as the web app (`src/utils/api.js`) — no backend changes were needed.

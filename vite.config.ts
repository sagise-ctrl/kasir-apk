import path from 'path';
import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { defineConfig } from 'vite';

// Standalone Vite config for the Kasir Android project. No Replit-specific
// tooling and no required env vars — just a normal Vite + React + Capacitor
// setup you can build anywhere (local machine or GitHub Actions).
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // Must match capacitor.config.ts `webDir`.
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    host: '0.0.0.0',
    watch: {
      ignored: ['**/android/**'],
    },
  },
  preview: {
    port: Number(process.env.PORT) || 5173,
    host: '0.0.0.0',
  },
});

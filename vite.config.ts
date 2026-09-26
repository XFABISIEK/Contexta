import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error - TAURI_ENV_PLATFORM is set by Tauri CLI
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "chrome105",
    minify: "esbuild",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});

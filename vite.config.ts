import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Prevent Vite from obscuring Rust errors
  clearScreen: false,
  server: {
    port: 8082,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || false,
    hmr: {
      overlay: false,
      protocol: "ws",
      host: process.env.TAURI_DEV_HOST || "localhost",
      port: 8082,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Tauri 期望前端 dev server 监听固定端口，且不自动打开浏览器
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    open: false,
  },
  // Tauri 构建产物输出到 src-tauri
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    outDir: "dist",
  },
});

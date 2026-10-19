/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite runs this under Node; the app itself never sees process.
declare const process: { env: Record<string, string | undefined> };

// 5178, beside Simple WMS's 5173, Simple TMS's 5174 and 5175 and Simple
// LMS's 5176 and 5177. /api is the API, as Caddy serves it: /api/v1/...
// reaches the API (127.0.0.1:8044 in Compose) as /v1/...
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5178,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.DOCS_API_URL ?? "http://127.0.0.1:8044",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: { outDir: "dist", sourcemap: false },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    testTimeout: 20000,
  },
});

// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,               // allows LAN access when you use --host
    port: 5173,
    strictPort: true,
    allowedHosts: "all",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        // strip the /api prefix so /api/auth/login -> /auth/login on FastAPI
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/uploads": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
    hmr: { clientPort: 5173 },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:3002",
    },
  },
  base: "/",
  envDir: ".",
  build: {
    chunkSizeWarningLimit: 700, // Setting this to 700kb gives you some headroom
  },
});

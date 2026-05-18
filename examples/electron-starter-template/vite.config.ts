import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
  },
  define: {
    // ← add this block
    global: "globalThis",
    "process.env": {},
    "process.browser": true,
  },
  resolve: {
    alias: {
      "@zerithdb/db": "zerithdb-db",
      "@zerithdb/sync": "zerithdb-sync",
      "@zerithdb/auth": "zerithdb-auth",
      "@zerithdb/network": "zerithdb-network",
      "@zerithdb/core": "zerithdb-core",
    },
  },
});

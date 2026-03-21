import { resolve } from "node:path";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, "webapp"),
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});

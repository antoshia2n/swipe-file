import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react({
      // node_modules/shia2n-core の .jsx も変換対象にする
      include: [/\.jsx?$/, /node_modules\/shia2n-core\/.*/],
    }),
  ],
  optimizeDeps: {
    include: ["shia2n-core"],
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: {
          // 2026-11-03：shia2n-core の軽い入口（lite.js）に乗り換えた
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore/lite"],
          supabase: ["@supabase/postgrest-js"],
        },
      },
    },
  },
});

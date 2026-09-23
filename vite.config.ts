/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// SINGLEFILE=1 produces a portable build: relative asset paths and no service
// worker, so a post-build step can inline everything into ONE self-contained
// index.html (see scripts/inline-singlefile.mjs). Normal builds keep the PWA.
const SINGLEFILE = !!process.env.SINGLEFILE;

// https://vitejs.dev/config/
export default defineConfig({
  base: SINGLEFILE ? "./" : "/",
  plugins: [
    react(),
    ...(SINGLEFILE
      ? []
      : [
          VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["favicon.svg"],
            manifest: {
              name: "All in One Personal Finance — Demo",
              short_name: "Finance Demo",
              description: "A live demo of All in One Personal Finance. Every visit resets to a fresh sample; nothing you enter is saved.",
              theme_color: "#1A1611",
              background_color: "#1A1611",
              display: "standalone",
              orientation: "portrait",
              start_url: "/",
              icons: [
                { src: "icon-192.png", sizes: "192x192", type: "image/png" },
                { src: "icon-512.png", sizes: "512x512", type: "image/png" },
                { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
              ],
            },
          }),
        ]),
  ],
  build: SINGLEFILE ? { cssCodeSplit: false, assetsInlineLimit: 100_000_000 } : {},
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: [],
    // Only this project's own tests. The `premierwork-all-in-one-personal-finance/`
    // entry excludes an accidental nested copy of the repo so its stale test
    // files are never collected.
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "premierwork-all-in-one-personal-finance/**"],
  },
});

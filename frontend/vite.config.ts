import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "favicon.svg",
        "favicon-light.svg",
        "icons/icon-dark-256.png",
        "icons/icon-dark-512.png",
      ],
      manifest: {
        id: "/",
        name: "Baln",
        short_name: "Baln",
        description: "個人複式記帳、帳戶管理與收支報表",
        lang: "zh-Hant-TW",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#171717",
        theme_color: "#171717",
        categories: ["finance", "productivity"],
        icons: [
          {
            src: "/icons/icon-dark-256.png",
            sizes: "256x256",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-dark-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/health\//,
          /^\/mcp(?:\/|$)/,
          /^\/oauth\/(?!consent(?:\/|$))/,
          /^\/\.well-known\//,
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

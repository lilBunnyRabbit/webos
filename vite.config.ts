import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import { version_plugin } from "./vite-plugin-version";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  // Served from lilbunnyrabbit.github.io/webos/ (GitHub Pages project site).
  base: "/webos/",
  plugins: [
    tailwindcss(),
    svelte(),
    //   {
    //   compilerOptions: {
    //     runes: true,
    //   },
    // }
    version_plugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "WebOS",
        short_name: "WebOS",
        description: "Operating System for the web",
        theme_color: "#17252C",
        // Matches the splash, so a standalone launch doesn't flash white before the app paints.
        background_color: "#17252C",
        icons: [
          {
            src: "pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      $lib: path.resolve("./src/lib"),
    },
  },
  // ADR-027. Browser tests run on the Vitest server's own origin, so their OPFS never sees real WebOS data.
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["src/**/*.test.ts"], exclude: ["src/**/*.browser.test.ts"], environment: "node" } },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: "chromium" }] },
        },
      },
    ],
  },
});

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import { playwright } from "@vitest/browser-playwright";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import { version_plugin } from "./vite-plugin-version";
import { phosphor_plugin } from "./vite-plugin-phosphor";
import path from "path";

// The font is only discovered once the CSS has loaded; a preload starts it with the entry chunk. Hashed name, so build only.
function preload_font_plugin(file: RegExp): Plugin {
  let base = "/";
  return {
    name: "webos-preload-font",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml(_, { bundle }) {
      const font = Object.keys(bundle ?? {}).find((name) => file.test(name));
      if (!font) return;
      return [
        {
          tag: "link",
          attrs: { rel: "preload", href: `${base}${font}`, as: "font", type: "font/woff2", crossorigin: "" },
          injectTo: "head",
        },
      ];
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Served from lilbunnyrabbit.github.io/webos/ (GitHub Pages project site).
  base: "/webos/",
  plugins: [
    tailwindcss(),
    phosphor_plugin(),
    svelte(),
    //   {
    //   compilerOptions: {
    //     runes: true,
    //   },
    // }
    version_plugin(),
    preload_font_plugin(/InterVariable-[^/]*\.woff2$/),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon-180x180.png"],
      workbox: {
        // mjs: the pdf.js worker (PDF Tools); woff2: Inter and Hack. Both so WebOS looks and works the same offline (owner, 2026-10-15).
        globPatterns: ["**/*.{js,mjs,css,html,woff2}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
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
  build: {
    rollupOptions: {
      output: {
        // ADR-049: one request for every app's display text instead of 77, and it compresses better together.
        manualChunks(id) {
          if (/\/apps\/(system|user)\/[^/]+\/meta\.ts$/.test(id)) return "app-meta";
        },
      },
    },
  },
  // The codec worker imports jSquash lazily, and a classic worker can't split chunks.
  worker: { format: "es" },
  // jSquash finds its wasm with `new URL("x.wasm", import.meta.url)`; pre-bundling moves the module away from the file.
  optimizeDeps: { exclude: ["@jsquash/avif", "@jsquash/jxl"] },
  resolve: {
    alias: {
      $lib: path.resolve("./src/lib"),
      $kit: path.resolve("./src/lib/kit"),
    },
  },
  // ADR-027. Browser tests run on the Vitest server's own origin, so their OPFS never sees real WebOS data.
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
          environment: "node",
          // Seeded puzzle generators run 2 s here and 2-3x that on the CI runner: the default 5 s fails them at random.
          testTimeout: 20_000,
        },
      },
      {
        extends: true,
        // Pre-bundled up front: discovering them mid-run makes Vite reload the test page.
        optimizeDeps: { include: ["zod", "phosphor-svelte", "uuid", "tailwind-merge", "tailwind-variants"] },
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: "chromium" }] },
        },
      },
    ],
  },
});

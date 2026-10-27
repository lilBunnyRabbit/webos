import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import { playwright } from "@vitest/browser-playwright";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import { get_version_info, version_plugin } from "./tooling/vite-plugin-version";
import { offline_plugin } from "./tooling/vite-plugin-offline";
import { catalogue_plugin, is_manifest_chunk } from "./tooling/vite-plugin-catalogue";
import { phosphor_imports_plugin, phosphor_plugin } from "./tooling/vite-plugin-phosphor";
import { core_modules } from "./tooling/vite-core-chunk";
import { import_map_plugin } from "./tooling/vite-plugin-import-map";
import { PORTFOLIO_PATH, portfolio_path_plugin } from "./tooling/vite-plugin-portfolio-path";
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

// ADR-067: `boot.ts` imports `main.ts` only after the browser check, so its chunks would start downloading only then.
// Preloading them from the HTML fetches them alongside the boot chunk. The stylesheet is only preloaded: applied, it
// would restyle the warning screen.
function preload_main_plugin(entry: string): Plugin {
  let base = "/";
  return {
    name: "webos-preload-main",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml(_, { bundle }) {
      const chunks = Object.values(bundle ?? {}).filter((file) => file.type === "chunk");
      const main = chunks.find((chunk) => chunk.moduleIds.includes(entry));
      if (!main) throw new Error(`preload main: no chunk holds ${entry}`);
      const linked = new Set(chunks.filter((chunk) => chunk.isEntry && !is_manifest_chunk(chunk.name)).flatMap((chunk) => [chunk.fileName, ...chunk.imports]));
      const files = new Set<string>();
      const css = new Set<string>();
      const walk = (file: string) => {
        if (files.has(file)) return;
        files.add(file);
        const chunk = chunks.find((item) => item.fileName === file);
        chunk?.viteMetadata?.importedCss.forEach((name) => css.add(name));
        chunk?.imports.forEach(walk);
      };
      walk(main.fileName);
      return [
        ...[...files].filter((file) => !linked.has(file)).map((file) => ({ tag: "link", attrs: { rel: "modulepreload", crossorigin: "", href: `${base}${file}` }, injectTo: "head" as const })),
        ...[...css].map((file) => ({ tag: "link", attrs: { rel: "preload", as: "style", crossorigin: "", href: `${base}${file}` }, injectTo: "head" as const })),
      ];
    },
  };
}

// Changes with every app edit, so nothing that reaches it may sit in the shared `core` chunk. The release and its notes
// aren't in the bundle at all (ADR-077, `RELEASE_MODULES`).
const VOLATILE = ["src/lib/apps/index.ts"];
const cores = new WeakMap<object, Set<string>>();
const BASE = "/webos/";
const info = get_version_info(process.cwd());
const offline = offline_plugin(info.buildTimestamp);
const catalogue = catalogue_plugin(info);

// https://vite.dev/config/
export default defineConfig({
  // Served from lilbunnyrabbit.github.io/webos/ (GitHub Pages project site).
  base: BASE,
  plugins: [
    tailwindcss(),
    phosphor_plugin(),
    svelte(),
    phosphor_imports_plugin(),
    //   {
    //   compilerOptions: {
    //     runes: true,
    //   },
    // }
    version_plugin(info, catalogue.version_fields),
    import_map_plugin(),
    offline.plugin,
    catalogue.plugin,
    portfolio_path_plugin(process.cwd()),
    preload_font_plugin(/InterVariable-[^/]*\.woff2$/),
    preload_main_plugin(path.resolve("src/main.ts")),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon-180x180.png"],
      workbox: {
        // ADR-077: the install precaches only core (offline/core.json), so an update takes seconds however many apps
        // there are. Every app, system apps included, loads on demand into the per-build runtime cache below.
        globPatterns: ["**/*.{js,mjs,css,html,woff2}"],
        manifestTransforms: [async (entries) => ({ manifest: entries.filter((entry) => offline.precached(entry.url)), warnings: [] })],
        // mammoth (Warren's .docx import) is cached on first use instead, like the wasm.
        globIgnores: ["**/mammoth-*.js", `${PORTFOLIO_PATH}/**`],
        // The Portfolio path always comes from the network, so it never boots a build older than the deploy.
        navigateFallbackDenylist: [new RegExp(`^${BASE}${PORTFOLIO_PATH}/`)],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Notification clicks (ADR-062): relative to sw.js, so it follows the base.
        importScripts: ["sw-notifications.js"],
        // The codec wasm (2–3.5 MB each), ONNX Runtime's wasm and Shopping List's text models stay out of the install;
        // cached on first use so AVIF, JPEG XL and reading a shopping list from a photo then work offline.
        runtimeCaching: [
          {
            urlPattern: /\.(wasm|onnx)$/,
            handler: "CacheFirst",
            options: { cacheName: "webos-wasm", expiration: { maxEntries: 16 } },
          },
          // Built-in app fonts (Burrow): about 0.5 MB, so cached when first chosen instead of in every install. Content-hashed
          // names, so a fixed font is a new entry.
          {
            urlPattern: /\.(ttf|ttc)$/,
            handler: "CacheFirst",
            options: { cacheName: "webos-fonts", cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 8 } },
          },
          // Warren's spelling dictionary (about 190 KB gz): fetched when the spelling list is first switched on.
          {
            urlPattern: /\.(aff|dic)$/,
            handler: "CacheFirst",
            options: { cacheName: "webos-dictionaries", cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 8 } },
          },
          // Warren's .docx import (~100 KB gzipped), which few installs ever use.
          {
            urlPattern: /\/assets\/mammoth-[^/]+\.js$/,
            handler: "CacheFirst",
            options: { cacheName: "webos-mammoth", cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 2 } },
          },
          // The app catalogue, icon sprite and changelog (ADR-077): fresh online, the last copy offline, so the App Store and
          // search still list apps that aren't installed and What's new still reads.
          {
            urlPattern: new RegExp(`^[^?#]*${BASE}store/`),
            handler: "NetworkFirst",
            options: { cacheName: "webos-store", networkTimeoutSeconds: 4, cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 4 } },
          },
          // Last, so the rules above keep their files. One cache for every release, so an app-only deploy leaves sw.js
          // alone: StoreService fills it with the installed apps and prunes what no app lists (ADR-077). No expiration,
          // which could evict an installed app.
          {
            urlPattern: new RegExp(`^[^?#]*${BASE}assets/`),
            handler: "CacheFirst",
            // ignoreVary: StoreService stores files it fetched itself, and a server's `Vary: Origin` would make a module
            // import miss them. The names are content-hashed, so any stored copy is the right one.
            options: {
              cacheName: "webos-assets",
              cacheableResponse: { statuses: [200] },
              matchOptions: { ignoreVary: true },
            },
          },
        ],
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
    // Every engine that can run WebOS has `modulepreload`; the polyfill only cost the boot chunk bytes.
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // A fixed name, so the precache can leave the chunk out.
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some((id) => id.includes("/node_modules/mammoth/")) ? "assets/mammoth-[hash].js" : "assets/[name]-[hash].js",
        manualChunks(id, { getModuleInfo }) {
          // `boot.ts` needs Vite's preload helper before the browser check; in `core` it would load all of core first.
          if (id === "\0vite/preload-helper.js") return "preload-helper";
          if (!cores.has(getModuleInfo)) {
            cores.set(getModuleInfo, core_modules(getModuleInfo, path.resolve("src/main.ts"), VOLATILE, "src/lib/apps"));
          }
          if (cores.get(getModuleInfo)!.has(id)) return "core";
        },
      },
    },
  },
  // The codec worker imports jSquash lazily, and a classic worker can't split chunks.
  worker: { format: "es" },
  // jSquash and ONNX Runtime find their wasm with `new URL("x.wasm", import.meta.url)`; pre-bundling moves the module
  // away from the file.
  optimizeDeps: { exclude: ["@jsquash/avif", "@jsquash/jxl", "onnxruntime-web"] },
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
          include: ["src/**/*.test.ts", "tooling/**/*.test.ts"],
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

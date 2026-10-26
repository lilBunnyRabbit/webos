import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { Plugin } from "vite";

export const PORTFOLIO_PATH = "portfolio";
const ROUTE = "#/solo/portfolio";

/** The shell's HTML, defaulting a bare visit to the Portfolio link and dropping the redirect's cache-busting query. */
export function portfolio_html(index: string): string {
  const script = `<script>history.replaceState(null, "", location.pathname + (location.hash || "${ROUTE}"));</script>`;
  return index.replace("</head>", `  ${script}\n  </head>`);
}

// `/webos/portfolio/` is the shell's HTML on a path the service worker leaves alone (no precache, no navigation
// fallback), so a Portfolio visit always boots the deployed build instead of the one cached before the last deploy.
// A fork without the Portfolio app gets no path.
export function portfolio_path_plugin(root: string): Plugin {
  let out_dir = "dist";
  return {
    name: "webos-portfolio-path",
    apply: "build",
    configResolved(config) {
      out_dir = resolve(config.root, config.build.outDir);
    },
    // Reads the written index.html (import map already in), before vite-plugin-pwa reads dist in closeBundle.
    writeBundle: {
      sequential: true,
      order: "post",
      handler() {
        if (!existsSync(resolve(root, "src/lib/apps/user/portfolio/index.ts"))) return;
        const index = readFileSync(resolve(out_dir, "index.html"), "utf-8");
        mkdirSync(resolve(out_dir, PORTFOLIO_PATH), { recursive: true });
        writeFileSync(resolve(out_dir, PORTFOLIO_PATH, "index.html"), portfolio_html(index));
      },
    },
  };
}

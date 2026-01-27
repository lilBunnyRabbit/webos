import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import type { Plugin } from "vite";

export interface VersionInfo {
  version: string;
  commit: string;
  branch: string;
  buildTime: string;
  buildTimestamp: number;
}

function get_version_info(root: string): VersionInfo {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
  const now = new Date();

  let commit = "unknown";
  let branch = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
    branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: root }).toString().trim();
  } catch {
    // Not a git repo or git not available
  }

  return {
    version: pkg.version,
    commit,
    branch,
    buildTime: now.toISOString(),
    buildTimestamp: now.getTime(),
  };
}

export function version_plugin(): Plugin {
  let root = process.cwd();

  return {
    name: "version-plugin",

    configResolved(config) {
      root = config.root;
    },

    // Dev: serve /version.json via middleware
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/version.json") {
          const info = get_version_info(root);
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(info, null, 2));
          return;
        }
        next();
      });
    },

    // Build: inject __VERSION_INFO__ define and write version.json to output
    config() {
      const info = get_version_info(root);
      return {
        define: {
          __VERSION_INFO__: JSON.stringify(info),
        },
      };
    },

    closeBundle() {
      const info = get_version_info(root);
      const out_dir = resolve(root, "dist");
      mkdirSync(out_dir, { recursive: true });
      writeFileSync(resolve(out_dir, "version.json"), JSON.stringify(info, null, 2));
    },
  };
}

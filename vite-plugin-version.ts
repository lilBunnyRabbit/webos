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

export function get_version_info(root: string): VersionInfo {
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

// One stamp per build or dev session: the bundle, version.json and the service worker's runtime cache name must match.
export function version_plugin(info: VersionInfo): Plugin {
  let out_dir = "dist";
  let version_url = "/version.json";

  return {
    name: "version-plugin",

    configResolved(config) {
      out_dir = resolve(config.root, config.build.outDir);
      version_url = `${config.base}version.json`;
    },

    // Dev: serve /version.json via middleware
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === version_url) {
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
      return {
        define: {
          __VERSION_INFO__: JSON.stringify(info),
        },
      };
    },

    closeBundle() {
      mkdirSync(out_dir, { recursive: true });
      writeFileSync(resolve(out_dir, "version.json"), JSON.stringify(info, null, 2));
    },
  };
}

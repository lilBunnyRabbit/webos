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

// One stamp per build or dev session: version.json and the catalogue must match.
export function version_plugin(info: VersionInfo, extra: () => Promise<object | null> = async () => null): Plugin {
  let out_dir = "dist";
  let version_url = "/version.json";
  let build = false;

  return {
    name: "version-plugin",

    configResolved(config) {
      out_dir = resolve(config.root, config.build.outDir);
      version_url = `${config.base}version.json`;
      build = config.command === "build";
    },

    // Dev: serve /version.json via middleware
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== version_url) return next();
        try {
          const body = JSON.stringify({ ...info, ...(await extra()) }, null, 2);
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(body);
        } catch (error) {
          next(error);
        }
      });
    },

    // `__VERSION_INFO__` is read only by the dev server and tests (`build-info.ts`); a build fails if a chunk holds it.
    config() {
      return {
        define: {
          __VERSION_INFO__: JSON.stringify(info),
        },
      };
    },

    async closeBundle() {
      if (!build) return;
      mkdirSync(out_dir, { recursive: true });
      writeFileSync(resolve(out_dir, "version.json"), JSON.stringify({ ...info, ...(await extra()) }, null, 2));
    },
  };
}

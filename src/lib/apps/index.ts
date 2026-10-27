import type { AppDefinition, AppManifest } from "$lib/core/api";
import { BUILD_INFO } from "$lib/core/api/services/version/build-info";

// Dev server and tests only (ADR-077): a build reads the catalogue instead, and never bundles this glob.
const modules = import.meta.glob<{ default: AppDefinition }>(["./system/*/index.ts", "./user/*/index.ts"], {
  eager: true,
});

export const apps: AppManifest[] = Object.entries(modules).map(([path, m]) => ({
  ...m.default,
  version: BUILD_INFO.version,
  system: path.startsWith("./system/"),
}));

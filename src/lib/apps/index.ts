import type { AppDefinition, AppManifest } from "$lib/core/api";

// Auto-discover all app manifests via glob
// - Metadata loads eagerly (available immediately for app listing)
// - Components load lazily (only when app launches)
const modules = import.meta.glob<{ default: AppDefinition }>(["./system/*/index.ts", "./user/*/index.ts"], {
  eager: true,
});

export const apps: AppManifest[] = Object.entries(modules).map(([path, m]) => ({
  ...m.default,
  system: path.startsWith("./system/"),
}));


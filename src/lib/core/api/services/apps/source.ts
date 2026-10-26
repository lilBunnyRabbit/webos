import type { AppDefinition, AppManifest } from "./type";
import { CORE_META, manifest_data, parse_catalogue, type Catalogue, type CatalogueApp } from "./catalogue";
import { BUILD_INFO } from "../version/build-info";

export interface CatalogueSource {
  /** Only a catalogue built against this core has entries whose code runs here (ADR-077). */
  readonly core: string;
  fetch(): Promise<Catalogue | null>;
  manifest(entry: CatalogueApp): Promise<AppDefinition>;
}

const CATALOGUE_URL = "store/catalogue.json";
export const DEV_CORE = "dev";

export function running_core(): string {
  if (import.meta.env.DEV) return DEV_CORE;
  return document.querySelector<HTMLMetaElement>(`meta[name="${CORE_META}"]`)?.content ?? "";
}

export function bundle_source(base: string = import.meta.env.BASE_URL): CatalogueSource {
  return {
    core: running_core(),
    async fetch() {
      try {
        const response = await fetch(`${base}${CATALOGUE_URL}`, { cache: "no-cache" });
        return response.ok ? parse_catalogue(await response.json()) : null;
      } catch {
        return null;
      }
    },
    async manifest(entry) {
      const module = (await import(/* @vite-ignore */ `${base}${entry.manifest}`)) as { default: AppDefinition };
      return module.default;
    },
  };
}

// No catalogue is built for the dev server and tests: `manifest_data`, the build's own function, describes the glob.
export function glob_source(manifests: AppManifest[]): CatalogueSource {
  let catalogue: Promise<Catalogue> | null = null;
  const by_id = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const entry = async (manifest: AppManifest): Promise<CatalogueApp> => {
    const meta = manifest.meta ? (await manifest.meta().catch(() => ({ default: {} }))).default : {};
    return {
      ...manifest_data(manifest as unknown as Record<string, unknown>, meta as Record<string, unknown>, manifest.system),
      version: BUILD_INFO.version,
      hash: "dev",
      manifest: manifest.id,
      entry: "",
      files: [],
    };
  };
  return {
    core: DEV_CORE,
    fetch: () =>
      (catalogue ??= Promise.all(manifests.map(entry)).then((apps) => ({
        version: 1,
        core: DEV_CORE,
        build: BUILD_INFO.buildTimestamp,
        release: BUILD_INFO.version,
        apps,
      }))),
    async manifest(entry) {
      const manifest = by_id.get(entry.id);
      if (!manifest) throw new Error(`App ${entry.id} not found`);
      return manifest;
    },
  };
}

export async function catalogue_source(): Promise<CatalogueSource> {
  // Dead code in a build: the glob, and every manifest with it, never reaches the bundle.
  if (import.meta.env.DEV) return glob_source((await import("$lib/apps")).apps);
  return bundle_source();
}

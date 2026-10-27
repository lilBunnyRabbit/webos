import type { AppDefinition } from "./type";
import { CORE_META, DEV_CORE, parse_catalogue, type Catalogue, type CatalogueApp } from "./catalogue";

export { DEV_CORE };

export interface CatalogueSource {
  /** Only a catalogue built against this core has entries whose code runs here (ADR-077). */
  readonly core: string;
  fetch(): Promise<Catalogue | null>;
  manifest(entry: CatalogueApp): Promise<AppDefinition>;
}

const CATALOGUE_URL = "store/catalogue.json";

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

export async function catalogue_source(): Promise<CatalogueSource> {
  // Dead code in a build: the glob, every manifest with it and the dev build stamp never reach the bundle.
  if (import.meta.env.DEV) {
    const [{ glob_source }, { apps }] = await Promise.all([import("./glob-source"), import("$lib/apps")]);
    return glob_source(apps);
  }
  return bundle_source();
}

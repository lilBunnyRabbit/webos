import type { AppManifest } from "./type";
import { manifest_data, type Catalogue, type CatalogueApp } from "./catalogue";
import { DEV_CORE, type CatalogueSource } from "./source";
import { BUILD_INFO } from "../version/build-info";

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
        commit: BUILD_INFO.commit,
        branch: BUILD_INFO.branch,
        apps,
      }))),
    async manifest(entry) {
      const manifest = by_id.get(entry.id);
      if (!manifest) throw new Error(`App ${entry.id} not found`);
      return manifest;
    },
  };
}

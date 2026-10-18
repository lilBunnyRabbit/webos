import type { AppId, AppListing, AppManifest, AppMeta, AppsService } from "./type";

export async function load_metas(apps: AppsService): Promise<ReadonlyMap<AppId, AppMeta>> {
  await apps.meta_ready;
  const ids = [...apps.list()].map(([id]) => id);
  return new Map(await Promise.all(ids.map(async (id) => [id, await apps.meta(id)] as const)));
}

/** Until the metas load, the bare manifest: search matches names, and the text fills in after. */
export function with_meta(manifest: AppManifest, metas: ReadonlyMap<AppId, AppMeta>): AppListing {
  const meta = metas.get(manifest.id);
  return meta ? { ...manifest, ...meta } : manifest;
}

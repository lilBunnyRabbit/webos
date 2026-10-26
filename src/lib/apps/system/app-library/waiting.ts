import { StoreStatus, type AppId, type StoreService } from "$lib/core/api";

/** Installed, but this release's files aren't on the device yet. The dev server never downloads, so never there. */
export function waiting_download(store: StoreService, id: AppId): boolean {
  return !import.meta.env.DEV && store.status(id) === StoreStatus.NOT_SAVED;
}

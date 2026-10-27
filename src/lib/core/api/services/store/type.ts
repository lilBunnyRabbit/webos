import type { IService } from "../../type";
import type { AppId } from "../apps/type";

export const StoreStatus = {
  /** Every file the app reaches is in `webos-assets`: it opens offline. */
  SAVED: "saved",
  DOWNLOADING: "downloading",
  /** Installed, but its files aren't all on this device yet (offline, or a download still to come). */
  NOT_SAVED: "not-saved",
  NOT_INSTALLED: "not-installed",
} as const;
export type StoreStatus = (typeof StoreStatus)[keyof typeof StoreStatus];

/**
 * Keeps installed apps on the device (ADR-077). The service worker precaches only the core; every app, system apps
 * included, loads into one `webos-assets` cache for every release. Installing an app downloads its whole file list, an
 * update downloads only the files not cached yet, and uninstalling deletes the files no other installed app lists.
 */
export interface StoreService extends IService {
  readonly online: boolean;

  /** True while this tab runs a download job. */
  readonly syncing: boolean;

  /** Every file the app's window can reach is in `webos-assets`. A set lookup. */
  is_saved(id: AppId): boolean;

  status(id: AppId): StoreStatus;

  /** 0 to 1 while the app downloads in this tab, `null` otherwise. Reactive: the icons' progress ring reads it. */
  progress(id: AppId): number | null;

  /**
   * Downloads the installed apps that aren't saved as one task (a task per app, Cancel, Retry), then deletes older
   * builds' caches. Only the tab holding the `webos.store.sync` lock runs it; another tab's call waits its turn and
   * finds the work done. Never throws; a no-op in dev.
   */
  sync(): Promise<void>;
}

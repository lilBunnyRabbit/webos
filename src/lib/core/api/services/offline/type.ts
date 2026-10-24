import type { IService } from "../../type";
import type { AppId } from "../apps/type";

export const OfflineStatus = {
  /** A system app: precached with the core, always there. */
  SYSTEM: "system",
  SAVED: "saved",
  DOWNLOADING: "downloading",
  NOT_SAVED: "not-saved",
} as const;
export type OfflineStatus = (typeof OfflineStatus)[keyof typeof OfflineStatus];

/**
 * Which user apps work offline (ADR-065). The service worker precaches only the core and the system apps; a user app
 * loads on demand into a per-build cache. Picked apps are downloaded whole after every update, and an app opened in a
 * build is downloaded whole too, so both open offline until the next update.
 */
export interface OfflineService extends IService {
  readonly online: boolean;

  /** User apps the user keeps offline, from `/etc/offline.json`. System apps are never in it. */
  readonly picked: ReadonlySet<AppId>;

  readonly syncing: boolean;

  is_picked(id: AppId): boolean;

  /** Every file the app's window can reach is in this build's cache. System apps always are. A set lookup. */
  is_saved(id: AppId): boolean;

  can_open(id: AppId): boolean;

  status(id: AppId): OfflineStatus;

  /** Ticks or unticks an app. Ticking one that isn't saved starts a sync. System apps are ignored. */
  set_picked(id: AppId, keep: boolean): void;

  /**
   * Downloads the picked apps that aren't saved as one task (a task per app, Cancel, Retry), then deletes older builds'
   * caches. Only the tab holding the `webos.offline.sync` lock runs it; another tab's call waits its turn and finds
   * the work done. Never throws.
   */
  sync(): Promise<void>;
}

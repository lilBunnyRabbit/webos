import type { IService } from "../../type";
import type { AppId } from "../apps/type";
import type { Pipeline } from "./pipeline";
import type { Release, ReleaseNote } from "./changelog-types";

export * from "./changelog-types";

export interface VersionInfo {
  version: string;
  commit: string;
  branch: string;
  buildTime: string;
  buildTimestamp: number;
}

/** Where "Update and reload" is. `IDLE` until the user asks; the update overlay shows every other stage. */
export const UpdateStage = {
  IDLE: "idle",
  INSTALLING: "installing",
  CLEARING: "clearing",
  RELOADING: "reloading",
} as const;
export type UpdateStage = (typeof UpdateStage)[keyof typeof UpdateStage];

/** The new service worker's download while `update_stage` is `installing`. */
export interface UpdateProgress {
  /** ms epoch */
  started: number;
  done: number;
  /** Files the install downloads; `null` until the new `sw.js` manifest is read, or when it couldn't be. */
  total: number | null;
  /** The wait has run long: the overlay offers `restart_update()`. */
  slow: boolean;
}

/** `version.json`: the build stamp, the core hash and the new release's notes (ADR-077); older builds have neither. */
export interface RemoteVersion extends VersionInfo {
  core?: string;
  notes?: ReleaseNote[];
}

/** An app and the release that first shipped it. */
export interface AppIntroduction {
  app: AppId;
  release: Release;
}

export interface VersionService extends IService {
  /**
   * The release this tab runs, from the running core's catalogue (ADR-077), never the bundle: an app-only update moves it.
   * `null` while unknown: offline on a release's first boot, with only another core's catalogue.
   */
  readonly info: VersionInfo | null;

  /** Remote version info if an update is available, otherwise null. */
  update_available: RemoteVersion | null;

  /** Whether a check is currently in progress. */
  is_checking: boolean;

  /** Progress of `apply_update()`, for the update overlay. */
  readonly update_stage: UpdateStage;

  /** The download behind the `installing` stage; `null` in every other stage. */
  readonly update_progress: UpdateProgress | null;

  /** Every release, newest first. Empty until `load_changelog()` resolves. */
  readonly changelog: Release[];
  /** Loads the release notes into `changelog` (empty until then, kept out of the boot chunk). Safe to call often. */
  load_changelog(): Promise<Release[]>;

  /** Releases newer than what this device had seen at boot. Kept for the session after they're marked seen. */
  readonly unseen: Release[];

  /**
   * Installed apps that `unseen` introduces: what the new-app announcement shows once the Restore question is answered
   * (ADR-038). Kept for the session, like `unseen`.
   */
  readonly announced: AppIntroduction[];

  /** Fetch remote version.json and compare buildTimestamp. */
  check(): Promise<void>;

  /**
   * Install the new service worker and reload into the new build. When no new worker turns up (the CDN still serves the
   * old `sw.js`), unregister this app's worker, delete its caches and reload with a cache-busting query.
   */
  apply_update(): Promise<void>;

  /** Stop waiting for the new worker and clear and reload now. Does nothing outside `installing`. */
  restart_update(): void;

  /** Show the full-screen introduction. Resolves when it closes. */
  show_intro(): Promise<void>;

  /**
   * The newest CI run on master and its jobs, fetched from GitHub's public API on every call (two requests out of the 60
   * an hour GitHub allows an IP without a token). `null` when there is no run. Throws offline or past the limit.
   */
  pipeline(signal?: AbortSignal): Promise<Pipeline | null>;
}

import type { IService } from "../../type";
import type { AppId } from "../apps/type";
import type { Pipeline } from "./pipeline";

export interface VersionInfo {
  version: string;
  commit: string;
  branch: string;
  buildTime: string;
  buildTimestamp: number;
}

export const ChangeKind = {
  NEW: "new",
  IMPROVED: "improved",
  FIXED: "fixed",
} as const;
export type ChangeKind = (typeof ChangeKind)[keyof typeof ChangeKind];

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

export interface Change {
  kind: ChangeKind;
  /** User-facing wording, one sentence. */
  text: string;
  /** The apps this line is about; it shows in each one's history in the App Store (ADR-038). */
  apps?: AppId[];
}

/** One entry of the hand-written changelog (ADR-026). */
export interface Release {
  /** Semver; the newest entry equals `package.json`. */
  version: string;
  /** `YYYY-MM-DD` */
  date: string;
  title: string;
  changes: Change[];
  /** Apps that first shipped in this release. A device updating past it gets the app announcement (ADR-038). */
  introduces?: AppId[];
}

/** A release as `version.json` carries it for the update screen: no app lists. */
export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  changes: Pick<Change, "kind" | "text">[];
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
  /** Current build's version info. */
  info: VersionInfo;

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

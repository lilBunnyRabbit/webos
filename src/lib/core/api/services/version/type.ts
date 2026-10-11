import type { IService } from "../../type";

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

export interface Change {
  kind: ChangeKind;
  /** User-facing wording, one sentence. */
  text: string;
}

/** One entry of the hand-written changelog (ADR-026). */
export interface Release {
  /** Semver; the newest entry equals `package.json`. */
  version: string;
  /** `YYYY-MM-DD` */
  date: string;
  title: string;
  changes: Change[];
}

export interface VersionService extends IService {
  /** Current build's version info. */
  info: VersionInfo;

  /** Remote version info if an update is available, otherwise null. */
  update_available: VersionInfo | null;

  /** Whether a check is currently in progress. */
  is_checking: boolean;

  /** Every release, newest first. */
  readonly changelog: Release[];

  /** Releases newer than what this device had seen at boot. Kept for the session after they're marked seen. */
  readonly unseen: Release[];

  /** Fetch remote version.json and compare buildTimestamp. */
  check(): Promise<void>;

  /** Install the new service worker, then reload into the new build. */
  apply_update(): Promise<void>;

  /** Show the full-screen introduction. Resolves when it closes. */
  show_intro(): Promise<void>;
}

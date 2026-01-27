import type { IService } from "../../type";

export interface VersionInfo {
  version: string;
  commit: string;
  branch: string;
  buildTime: string;
  buildTimestamp: number;
}

export interface VersionService extends IService {
  /** Current build's version info. */
  info: VersionInfo;

  /** Remote version info if an update is available, otherwise null. */
  update_available: VersionInfo | null;

  /** Whether a check is currently in progress. */
  is_checking: boolean;

  /** Fetch remote version.json and compare buildTimestamp. */
  check(): Promise<void>;

  /** Clear caches, unregister service workers, and hard-reload. */
  apply_update(): Promise<void>;
}

import type { IService } from "../../type";

export const BackupArea = {
  FILES: "files",
  SETTINGS: "settings",
  APPS: "apps",
} as const;
export type BackupArea = (typeof BackupArea)[keyof typeof BackupArea];

export interface BackupAreaInfo {
  area: BackupArea;
  label: string;
  path: string;
  /** Inside the zip. */
  prefix: string;
}

/** `/tmp` and caches never go in a backup. App data also covers the `app.*` localStorage keys. */
export const BACKUP_AREAS: readonly BackupAreaInfo[] = [
  { area: BackupArea.FILES, label: "Files", path: "/home", prefix: "home" },
  { area: BackupArea.SETTINGS, label: "Settings", path: "/etc", prefix: "etc" },
  { area: BackupArea.APPS, label: "App data", path: "/var/lib", prefix: "var/lib" },
];

export const BackupActivity = {
  CREATING: "creating",
  RESTORING: "restoring",
} as const;
export type BackupActivity = (typeof BackupActivity)[keyof typeof BackupActivity];

export interface BackupSaved {
  /** The name it was saved under on the device; the save picker lets the user change it. */
  name: string;
  size: number;
  areas: BackupArea[];
  at: Date;
}

/**
 * Backups (ADR-037): one zip of the chosen areas, saved to the device and never to OPFS, and a restore that replaces
 * the areas the zip holds, then reloads.
 */
export interface BackupService extends IService {
  readonly activity: BackupActivity | null;
  /** In this tab. */
  readonly last: BackupSaved | null;

  /** App data counts its `app.*` localStorage too. */
  sizes(): Promise<Record<BackupArea, number>>;
  /**
   * Zips `areas` and saves it to the device: the save picker where there is one, else a download. The picker needs a
   * user activation (a click or a key press). Resolves `null` when the user cancels the picker.
   */
  create(areas: BackupArea[]): Promise<BackupSaved | null>;
  /**
   * Picks a backup on the device, validates it, asks before replacing the areas it holds, replaces them and reloads
   * the page. Resolves `false` when the user cancels the picker or the question. Throws a message for the user when
   * the file isn't a backup, comes from a newer WebOS, or a window has unsaved changes.
   */
  restore(): Promise<boolean>;
}

export class BackupError extends Error {
  name = "BackupError";
}

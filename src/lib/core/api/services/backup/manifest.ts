import { z } from "zod";
import { day_key } from "$lib/core/utils/date";
import { BACKUP_AREAS, BackupArea, BackupError, type BackupAreaInfo } from "./type";

export const BACKUP_FORMAT = 1;
export const MANIFEST_NAME = "backup.json";
export const APP_STORAGE_PREFIX = "app.";

export const BackupManifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.string(),
  created: z.iso.datetime(),
  areas: z.array(z.enum(BackupArea)).min(1),
  local_storage: z.record(z.string().startsWith(APP_STORAGE_PREFIX), z.string()),
});
export type BackupManifest = z.infer<typeof BackupManifestSchema>;

export function backup_name(date: Date): string {
  return `webos-backup-${day_key(date)}.zip`;
}

export function normalize_areas(areas: readonly string[]): BackupArea[] {
  return BACKUP_AREAS.filter(({ area }) => areas.includes(area)).map(({ area }) => area);
}

export function area_of(segments: readonly string[]): BackupAreaInfo | null {
  return (
    BACKUP_AREAS.find(({ prefix }) => {
      const parts = prefix.split("/");
      return parts.every((part, index) => segments[index] === part);
    }) ?? null
  );
}

export function app_storage(storage: Storage): Record<string, string> {
  const entries: Record<string, string> = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(APP_STORAGE_PREFIX)) entries[key] = storage.getItem(key) ?? "";
  }
  return entries;
}

export function storage_bytes(entries: Record<string, string>): number {
  const encoder = new TextEncoder();
  return Object.entries(entries).reduce(
    (sum, [key, value]) => sum + encoder.encode(key).length + encoder.encode(value).length,
    0
  );
}

export function serialize_manifest(manifest: BackupManifest): string {
  return JSON.stringify(manifest, null, 2) + "\n";
}

/** Rejects a backup from a newer WebOS before the full schema, so the user hears why rather than "damaged". */
export function parse_manifest(text: string): BackupManifest {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("This backup is damaged: backup.json isn't valid JSON.");
  }

  const format = z.object({ format: z.number().int() }).safeParse(data);
  if (!format.success) throw new BackupError("This isn't a WebOS backup: backup.json has no format.");
  if (format.data.format > BACKUP_FORMAT) {
    throw new BackupError(
      `This backup comes from a newer WebOS (format ${format.data.format}). Update WebOS, then restore it.`
    );
  }

  const result = BackupManifestSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new BackupError(
      `This backup is damaged: ${issue.path.join(".") || "backup.json"} ${issue.message.toLowerCase()}.`
    );
  }
  return result.data;
}

import { v7 } from "uuid";

export const UuidVersion = { V4: "v4", V7: "v7" } as const;
export type UuidVersion = (typeof UuidVersion)[keyof typeof UuidVersion];

export const MAX_UUIDS = 1000;

export function generate_uuid(version: UuidVersion): string {
  return version === UuidVersion.V4 ? crypto.randomUUID() : v7();
}

export function generate_uuids(version: UuidVersion, count: number): string[] {
  const total = Math.min(MAX_UUIDS, Math.max(1, Math.floor(Number.isFinite(count) ? count : 1)));
  return Array.from({ length: total }, () => generate_uuid(version));
}

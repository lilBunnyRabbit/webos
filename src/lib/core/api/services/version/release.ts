import type { CatalogueHeader } from "../apps/catalogue";
import { compare_versions } from "./semver";
import type { Release, VersionInfo } from "./type";

/** Written by the build from `changelog.ts`, at a fixed name: a new line never renames a precached file (ADR-077). */
export const CHANGELOG_URL = "store/changelog.json";

export function release_info(header: CatalogueHeader | null): VersionInfo | null {
  if (!header) return null;
  return {
    version: header.release,
    commit: header.commit ?? "unknown",
    branch: header.branch ?? "unknown",
    buildTime: new Date(header.build).toISOString(),
    buildTimestamp: header.build,
  };
}

function is_release(value: unknown): value is Release {
  const release = value as Partial<Release> | null;
  return typeof release?.version === "string" && typeof release.title === "string" && Array.isArray(release.changes);
}

export function parse_changelog(value: unknown): Release[] | null {
  return Array.isArray(value) && value.every(is_release) ? value : null;
}

/** The deployed changelog can run ahead of this tab while a core update waits: releases past the running one are left out. */
export function running_changelog(changelog: readonly Release[], running: string | null): Release[] {
  return running === null ? [...changelog] : changelog.filter((release) => compare_versions(release.version, running) <= 0);
}

export async function fetch_changelog(base: string = import.meta.env.BASE_URL): Promise<Release[] | null> {
  try {
    const response = await fetch(`${base}${CHANGELOG_URL}`, { cache: "no-cache" });
    return response.ok ? parse_changelog(await response.json()) : null;
  } catch {
    return null;
  }
}

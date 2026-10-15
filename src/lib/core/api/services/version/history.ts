import type { AppId } from "../apps/type";
import type { AppIntroduction, Change, Release } from "./type";

export interface AppChange {
  release: Release;
  change: Change;
}

export interface AppHistory {
  /** `null` for apps older than the release notes that were never announced. */
  added: Release | null;
  updated: Release | null;
  changes: AppChange[];
}

export function app_history(changelog: readonly Release[], app: AppId): AppHistory {
  const added = changelog.find((release) => release.introduces?.includes(app)) ?? null;
  const changes = changelog.flatMap((release) =>
    release.changes.filter((change) => change.apps?.includes(app)).map((change) => ({ release, change }))
  );
  const updated = changes.find(({ release }) => release !== added && (!added || is_newer(changelog, release, added)))?.release ?? null;
  return { added, updated, changes };
}

export function introduced_apps(releases: readonly Release[]): AppIntroduction[] {
  const seen = new Set<AppId>();
  return releases.flatMap((release) =>
    (release.introduces ?? []).flatMap((app) => {
      if (seen.has(app)) return [];
      seen.add(app);
      return [{ app, release }];
    })
  );
}

export function updated_apps(releases: readonly Release[]): Set<AppId> {
  const introduced = new Set(releases.flatMap((release) => release.introduces ?? []));
  const apps = releases.flatMap((release) => release.changes.flatMap((change) => change.apps ?? []));
  return new Set(apps.filter((app) => !introduced.has(app)));
}

/** Lower is more recent; `Infinity` for an app the changelog never mentions. */
export function recency(changelog: readonly Release[], app: AppId): number {
  const index = changelog.findIndex(
    (release) => release.introduces?.includes(app) || release.changes.some((change) => change.apps?.includes(app))
  );
  return index === -1 ? Infinity : index;
}

function is_newer(changelog: readonly Release[], a: Release, b: Release): boolean {
  return changelog.indexOf(a) < changelog.indexOf(b);
}

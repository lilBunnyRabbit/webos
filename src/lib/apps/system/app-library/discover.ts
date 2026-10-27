import { app_authors, OWNER } from "$lib/core/api/services/apps/authors";
import type { FeaturedApp } from "$lib/core/api/services/apps/featured";
import type { Interest } from "$lib/core/api/services/apps/suggestions";
import type { AppUsage } from "$lib/core/api";
import { AppCategory, type AppId, type AppListing } from "$lib/core/api/services/apps/type";
import { introduced_apps } from "$lib/core/api/services/version/history";
import type { Change, Release } from "$lib/core/api/services/version/type";
import { app_story } from "./library";

export interface HeroCard {
  manifest: AppListing;
  overline: string;
  tagline: string;
}

export interface Shelf {
  id: string;
  label: string;
  description?: string;
  apps: AppListing[];
}

export interface AppUpdate {
  manifest: AppListing;
  release: Release;
  change: Change | null;
}

const SHELF_LIMIT = 12;
const HERO_NEW = 3;
const HERO_LIMIT = 6;
const MIN_SHELF = 3;
const RECENT_RELEASES = 6;

function index_of(listings: readonly AppListing[]): Map<AppId, AppListing> {
  return new Map(listings.map((manifest) => [manifest.id, manifest]));
}

export function hero_cards(listings: readonly AppListing[], changelog: readonly Release[], featured: readonly FeaturedApp[]): HeroCard[] {
  const known = index_of(listings);
  const cards: HeroCard[] = [];
  const add = (id: AppId, overline: string, tagline?: string) => {
    const manifest = known.get(id);
    if (!manifest || manifest.system || cards.some((card) => card.manifest.id === id)) return;
    cards.push({ manifest, overline, tagline: tagline ?? app_story(manifest).solution });
  };
  for (const { app, release } of introduced_apps(changelog).slice(0, HERO_NEW)) add(app, `New in ${release.version}`);
  for (const pick of featured) add(pick.app, "Featured", pick.tagline);
  return cards.slice(0, HERO_LIMIT);
}

export function new_apps(listings: readonly AppListing[], changelog: readonly Release[]): AppListing[] {
  const known = index_of(listings);
  return introduced_apps(changelog)
    .flatMap(({ app }) => known.get(app) ?? [])
    .slice(0, SHELF_LIMIT);
}

/** Apps the newest release notes change, newest first; a release that introduces an app doesn't count as its update. */
export function app_updates(listings: readonly AppListing[], changelog: readonly Release[], releases = RECENT_RELEASES): AppUpdate[] {
  const known = index_of(listings);
  const seen = new Set<AppId>();
  const updates: AppUpdate[] = [];
  for (const release of changelog.slice(0, releases)) {
    for (const change of release.changes) {
      for (const id of change.apps ?? []) {
        const manifest = known.get(id);
        if (!manifest || seen.has(id) || release.introduces?.includes(id)) continue;
        seen.add(id);
        updates.push({ manifest, release, change });
      }
    }
  }
  return updates;
}

export function recently_updated(listings: readonly AppListing[], changelog: readonly Release[]): AppListing[] {
  return app_updates(listings, changelog)
    .map((update) => update.manifest)
    .filter((manifest) => !manifest.system)
    .slice(0, SHELF_LIMIT);
}

/** The intro's interests, then widgets and apps by other people; a shelf with under three known apps is dropped. */
export function collections(listings: readonly AppListing[], interests: readonly Interest[]): Shelf[] {
  const known = index_of(listings);
  const user = listings.filter((manifest) => !manifest.system);
  const by_name = (a: AppListing, b: AppListing) => a.name.localeCompare(b.name);
  const shelves: Shelf[] = [
    ...interests.map((interest) => ({
      id: interest.id,
      label: interest.label,
      description: interest.description,
      apps: interest.apps.flatMap((id) => known.get(id) ?? []),
    })),
    {
      id: "widgets",
      label: "Widgets for your desktop",
      description: "Apps that live on the desktop or the home screen too",
      apps: user.filter((manifest) => manifest.widget !== undefined).sort(by_name),
    },
    {
      id: "community",
      label: "Made by the community",
      description: "Ideas and apps from people other than the maker",
      apps: user.filter((manifest) => app_authors(manifest).some((author) => author.name !== OWNER.name)).sort(by_name),
    },
  ];
  return shelves.filter((shelf) => shelf.apps.length >= MIN_SHELF).map((shelf) => ({ ...shelf, apps: shelf.apps.slice(0, SHELF_LIMIT * 2) }));
}

export function release_of(changelog: readonly Release[], version: string): Release | null {
  return changelog.find((release) => release.version === version) ?? null;
}

export function is_game(manifest: AppListing): boolean {
  return !manifest.system && manifest.category === AppCategory.GAMES;
}

export const LibrarySortBy = { RECENT: "recent", NAME: "name", SIZE: "size" } as const;
export type LibrarySortBy = (typeof LibrarySortBy)[keyof typeof LibrarySortBy];

export function sort_library(
  apps: readonly AppListing[],
  sort: LibrarySortBy,
  usage: (id: AppId) => AppUsage | null,
  size: (id: AppId) => number | null
): AppListing[] {
  const by_name = (a: AppListing, b: AppListing) => a.name.localeCompare(b.name);
  const list = [...apps];
  if (sort === LibrarySortBy.NAME) return list.sort(by_name);
  if (sort === LibrarySortBy.SIZE) return list.sort((a, b) => (size(b.id) ?? -1) - (size(a.id) ?? -1) || by_name(a, b));
  const last = (id: AppId) => usage(id)?.last ?? "";
  return list.sort((a, b) => last(b.id).localeCompare(last(a.id)) || by_name(a, b));
}

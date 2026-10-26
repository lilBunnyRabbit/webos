import { describe, expect, test } from "vitest";
import { AppCategory, type AppListing } from "$lib/core/api/services/apps/type";
import { ChangeKind, type Release } from "$lib/core/api/services/version/type";
import { app_updates, collections, hero_cards, is_game, LibrarySortBy, new_apps, recently_updated, release_of, sort_library } from "./discover";

const app = (id: string, extra: Partial<AppListing> = {}) =>
  ({ id, name: id[0].toUpperCase() + id.slice(1), category: AppCategory.UTILITIES, system: false, description: `${id} app`, ...extra }) as AppListing;

const APPS = [
  app("snake", { category: AppCategory.GAMES }),
  app("paint", { pitch: { problem: "No canvas.", solution: "Paint here." }, widget: async () => ({ default: (() => {}) as never }) }),
  app("notes", { widget: async () => ({ default: (() => {}) as never }), authors: [{ name: "Lax" }] }),
  app("clock", { widget: async () => ({ default: (() => {}) as never }), authors: [{ name: "Ann" }] }),
  app("timer", { authors: [{ name: "Bo" }] }),
  app("settings", { system: true }),
];

const release = (version: string, extra: Partial<Release> = {}): Release => ({ version, date: "2026-10-01", title: version, changes: [], ...extra });

const CHANGELOG: Release[] = [
  release("3.3.0", { changes: [{ kind: ChangeKind.IMPROVED, text: "Paint is faster.", apps: ["paint", "settings"] }] }),
  release("3.2.0", { introduces: ["notes"], changes: [{ kind: ChangeKind.NEW, text: "Notes.", apps: ["notes"] }] }),
  release("3.1.0", { introduces: ["gone", "snake"], changes: [{ kind: ChangeKind.FIXED, text: "Paint fix.", apps: ["paint"] }] }),
];

describe("hero_cards", () => {
  test("the newest apps, then the picks, each once, with a tagline", () => {
    const cards = hero_cards(APPS, CHANGELOG, [{ app: "notes" }, { app: "paint" }, { app: "settings" }, { app: "missing" }]);
    expect(cards.map((card) => [card.manifest.id, card.overline])).toEqual([
      ["notes", "New in 3.2.0"],
      ["snake", "New in 3.1.0"],
      ["paint", "Featured"],
    ]);
    expect(cards[2].tagline).toBe("Paint here.");
  });

  test("a pick's tagline wins over the pitch", () => {
    expect(hero_cards(APPS, [], [{ app: "paint", tagline: "Draw." }])[0].tagline).toBe("Draw.");
  });
});

describe("shelves", () => {
  test("new apps follow the changelog, skipping unknown ids", () => {
    expect(new_apps(APPS, CHANGELOG).map((manifest) => manifest.id)).toEqual(["notes", "snake"]);
  });

  test("updates: newest mention, never the release that introduced it", () => {
    const updates = app_updates(APPS, CHANGELOG);
    expect(updates.map((update) => [update.manifest.id, update.release.version])).toEqual([
      ["paint", "3.3.0"],
      ["settings", "3.3.0"],
    ]);
    expect(recently_updated(APPS, CHANGELOG).map((manifest) => manifest.id)).toEqual(["paint"]);
  });

  test("collections drop shelves under three apps", () => {
    const shelves = collections(APPS, [
      { id: "make", label: "Make", description: "", apps: ["paint", "notes", "clock"] },
      { id: "small", label: "Small", description: "", apps: ["paint", "gone"] },
    ]);
    expect(shelves.map((shelf) => shelf.id)).toEqual(["make", "widgets", "community"]);
    expect(shelves[1].apps.map((manifest) => manifest.id)).toEqual(["clock", "notes", "paint"]);
    expect(shelves[2].apps.map((manifest) => manifest.id)).toEqual(["clock", "notes", "timer"]);
  });
});

describe("helpers", () => {
  test("release_of and is_game", () => {
    expect(release_of(CHANGELOG, "3.2.0")?.title).toBe("3.2.0");
    expect(release_of(CHANGELOG, "1.0.0")).toBeNull();
    expect(is_game(APPS[0])).toBe(true);
    expect(is_game(APPS[1])).toBe(false);
  });

  test("library sorts by recent use, never-used last, or by size", () => {
    const usage = (id: string) => (id === "paint" ? { seconds: 1, last: "2026-10-02T00:00:00Z", days: 1 } : id === "snake" ? { seconds: 1, last: "2026-10-03T00:00:00Z", days: 1 } : null);
    const size = (id: string) => ({ clock: 10, notes: 30 })[id] ?? null;
    const list = APPS.slice(0, 4);
    expect(sort_library(list, LibrarySortBy.RECENT, usage, size).map((manifest) => manifest.id)).toEqual(["snake", "paint", "clock", "notes"]);
    expect(sort_library(list, LibrarySortBy.SIZE, usage, size).map((manifest) => manifest.id)).toEqual(["notes", "clock", "paint", "snake"]);
  });
});

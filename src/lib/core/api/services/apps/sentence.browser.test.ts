import { describe, expect, test } from "vitest";
import "$lib/core/api";
import { apps } from "$lib/apps";
import { search_apps } from "./search";
import { build_sentence_index, rank_sentence } from "./sentence";
import type { AppListing, AppMeta } from "./type";
import { NAME_QUERIES, SAMPLE_QUERIES, UNSEEN_QUERIES, type QueryCase } from "./fixtures/sentence-queries";

const metas = import.meta.glob<{ default: AppMeta }>("/src/lib/apps/*/*/meta.ts", { eager: true });
const meta_of = (id: string) => Object.entries(metas).find(([path]) => path.endsWith(`/${id}/meta.ts`))?.[1].default ?? {};
const listings: AppListing[] = apps.map((manifest) => ({ ...manifest, ...meta_of(manifest.id) }));
const index = build_sentence_index(listings);

function shown(query: string): string[] {
  const strict = search_apps(listings, query).map((app) => app.id);
  const related = rank_sentence(index, query)
    .map((app) => app.id)
    .filter((id) => !strict.includes(id));
  return [...strict, ...related];
}

function score(cases: QueryCase[]) {
  const misses = cases.filter(([query, right]) => !shown(query).slice(0, 3).some((id) => right.includes(id)));
  return { hits: cases.length - misses.length, misses: misses.map(([query]) => `${query} → ${shown(query).slice(0, 3).join(", ")}`) };
}

describe("sentence search on the real catalogue", () => {
  test("every sample sentence finds a right app in the top 3", () => {
    expect(score(SAMPLE_QUERIES).misses).toEqual([]);
  });

  test("at least 18 of 20 unseen sentences find a right app in the top 3", () => {
    const result = score(UNSEEN_QUERIES);
    expect(result.hits, result.misses.join("\n")).toBeGreaterThanOrEqual(18);
  });

  test("names, prefixes and a typo still find their app in the top 3", () => {
    expect(score(NAME_QUERIES).misses).toEqual([]);
  });
});

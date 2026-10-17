import { describe, expect, it, vi } from "vitest";

// plays.svelte.ts reaches the kernel through json_file: the same stubs as app-api.test.ts.
vi.mock("$lib/apps", () => ({ apps: [] }));
vi.stubGlobal("location", { search: "" });
vi.stubGlobal("matchMedia", () => ({ matches: false }));

describe("PlaysSchema", () => {
  it("reads a daily from before scores", async () => {
    const { PlaysSchema } = await import("./plays.svelte");
    const old = { version: 1, games: {}, daily: { "2026-10-14": { sudoku: { ms: 61_000 } } } };
    expect(PlaysSchema.parse(old)).toEqual(old);
  });

  it("keeps a daily's score", async () => {
    const { PlaysSchema } = await import("./plays.svelte");
    const scored = { version: 1, games: {}, daily: { "2026-10-17": { "crack-the-code": { ms: 90_000, score: 6 } } } };
    expect(PlaysSchema.parse(scored)).toEqual(scored);
  });
});

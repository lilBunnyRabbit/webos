import { afterEach, describe, expect, test, vi } from "vitest";
import { AiAvailability, type AiService } from "$lib/core/api/services/ai/type";
import { AppCategory, type AppListing } from "$lib/core/api/services/apps/type";
import { sentence_fixture } from "./sentence-search-fixture.svelte";

const app = (name: string, extra: Partial<AppListing> = {}) =>
  ({ id: name.toLowerCase().replace(/\s+/g, "-"), name, category: AppCategory.MEDIA, system: false, ...extra }) as AppListing;

const HOPSPRITE = app("Hopsprite", { keywords: ["pixel art", "sprite"], description: "Draw sprites one pixel at a time." });
const PAINT = app("Paint", { keywords: ["draw", "brush"], description: "Paint on a canvas." });
const RECORDER = app("Recorder", { keywords: ["audio", "microphone"], description: "Record your voice." });
const APPS = [HOPSPRITE, PAINT, RECORDER];

function stub_ai(answer: (sentence: string, signal?: AbortSignal) => Promise<{ keywords: string[] }>, prompt: AiAvailability = AiAvailability.READY) {
  const extract = vi.fn((messages: { content: unknown }[], _schema: unknown, options?: { signal?: AbortSignal }) =>
    answer(String(messages.at(-1)!.content), options?.signal)
  );
  return { ai: { features: { prompt }, extract } as unknown as AiService, extract };
}

let stop: (() => void) | undefined;
afterEach(() => stop?.());

describe("SentenceSearch", () => {
  test("loads the ranker on the first query, then lists related apps the strict search didn't show", async () => {
    const fixture = sentence_fixture(APPS, null);
    stop = fixture.stop;
    expect(fixture.search.related).toEqual([]);
    fixture.type("tool to make pixelart");
    await vi.waitFor(() => expect(fixture.search.related).toEqual([HOPSPRITE]));
    expect(fixture.search.pending).toBe(false);
    fixture.type("draw", [PAINT]);
    expect(fixture.search.related.map((listing) => listing.id)).not.toContain("paint");
  });

  test("asks the model about sentences of three words or more, once typing pauses, and lists its picks", async () => {
    const { ai, extract } = stub_ai(async () => ({ keywords: ["microphone", "audio"] }));
    const fixture = sentence_fixture(APPS, ai);
    stop = fixture.stop;
    fixture.type("sing into");
    fixture.type("something to sing into");
    expect(extract).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(fixture.search.suggested).toEqual([RECORDER]));
    expect(extract).toHaveBeenCalledTimes(1);
    fixture.type("something to sing into today");
    expect(fixture.search.suggested).toEqual([]);
  });

  test("a new keystroke aborts the request in flight", async () => {
    const signals: AbortSignal[] = [];
    const { ai } = stub_ai((_, signal) => {
      signals.push(signal!);
      return new Promise(() => {});
    });
    const fixture = sentence_fixture(APPS, ai);
    stop = fixture.stop;
    fixture.type("something to sing into");
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    fixture.type("something to sing into now");
    expect(signals[0].aborted).toBe(true);
  });

  test("no model, short queries and failures leave the row out quietly", async () => {
    const missing = stub_ai(async () => ({ keywords: ["audio"] }), AiAvailability.DOWNLOAD);
    const failing = stub_ai(async () => {
      throw new Error("busy");
    });
    for (const { ai, extract } of [missing, failing]) {
      const fixture = sentence_fixture(APPS, ai);
      fixture.type("something to sing into");
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(fixture.search.suggested).toEqual([]);
      fixture.stop();
      expect(extract).toHaveBeenCalledTimes(ai === failing.ai ? 1 : 0);
    }
  });
});

import { afterEach, describe, expect, test, vi } from "vitest";
import { check, has_image, history_key, same_language, to_availability } from "./availability";
import { AiAvailability, AiFeature } from "./type";

afterEach(() => vi.unstubAllGlobals());

describe("to_availability", () => {
  test("maps the browser's four answers onto ready, download and no", () => {
    expect(to_availability("available")).toBe(AiAvailability.READY);
    expect(to_availability("downloadable")).toBe(AiAvailability.DOWNLOAD);
    expect(to_availability("downloading")).toBe(AiAvailability.DOWNLOAD);
    expect(to_availability("unavailable")).toBe(AiAvailability.NO);
  });
});

describe("check", () => {
  test("a browser without the APIs answers no for every feature", async () => {
    for (const feature of Object.values(AiFeature)) expect(await check(feature)).toBe(AiAvailability.NO);
  });

  test("asks the matching API", async () => {
    vi.stubGlobal("Summarizer", { availability: async () => "available" });
    vi.stubGlobal("LanguageModel", { availability: async () => "downloadable" });
    expect(await check(AiFeature.SUMMARIZE)).toBe(AiAvailability.READY);
    expect(await check(AiFeature.PROMPT)).toBe(AiAvailability.DOWNLOAD);
    expect(await check(AiFeature.DETECT)).toBe(AiAvailability.NO);
  });

  test("prompt-image asks the Prompt API for a session that takes pictures", async () => {
    const availability = vi.fn(async (options?: { expectedInputs?: { type: string }[] }) =>
      options?.expectedInputs?.some((input) => input.type === "image") ? "unavailable" : "available"
    );
    vi.stubGlobal("LanguageModel", { availability });
    expect(await check(AiFeature.PROMPT)).toBe(AiAvailability.READY);
    expect(await check(AiFeature.PROMPT_IMAGE)).toBe(AiAvailability.NO);
  });

  test("translate answers per pair, and download for the API alone", async () => {
    const availability = vi.fn(async ({ targetLanguage }: { targetLanguage: string }) =>
      targetLanguage === "de" ? "available" : "unavailable"
    );
    vi.stubGlobal("Translator", { availability });
    expect(await check(AiFeature.TRANSLATE)).toBe(AiAvailability.DOWNLOAD);
    expect(await check(AiFeature.TRANSLATE, { from: "en", to: "de" })).toBe(AiAvailability.READY);
    expect(await check(AiFeature.TRANSLATE, { from: "en", to: "xx" })).toBe(AiAvailability.NO);
    expect(availability).toHaveBeenCalledWith({ sourceLanguage: "en", targetLanguage: "de" });
  });

  test("a rejected check, like a bad language tag, is no", async () => {
    vi.stubGlobal("Translator", { availability: async () => Promise.reject(new RangeError("bad tag")) });
    expect(await check(AiFeature.TRANSLATE, { from: "en", to: "??" })).toBe(AiAvailability.NO);
  });
});

describe("same_language", () => {
  test("ignores the region and case", () => {
    expect(same_language("en-US", "en")).toBe(true);
    expect(same_language("EN", "en-gb")).toBe(true);
    expect(same_language("sl", "sk")).toBe(false);
  });
});

describe("history_key", () => {
  test("matches the same turns and differs on any change", () => {
    const a = history_key([{ role: "user", content: "hi" }]);
    expect(a).toBe(history_key([{ role: "user", content: "hi" }]));
    expect(a).not.toBe(history_key([{ role: "assistant", content: "hi" }]));
    expect(history_key([])).not.toBe(a);
  });
});

describe("history_key with pictures", () => {
  test("the same Blob gives the same key, another one with the same bytes doesn't", () => {
    const photo = new Blob(["a"]);
    const turn = (value: Blob) => [{ role: "user" as const, content: [{ type: "text" as const, value: "hi" }, { type: "image" as const, value }] }];
    expect(history_key(turn(photo))).toBe(history_key(turn(photo)));
    expect(history_key(turn(photo))).not.toBe(history_key(turn(new Blob(["a"]))));
  });

  test("parts don't collide with plain text", () => {
    const parts = history_key([{ role: "user", content: [{ type: "text", value: "hi" }] }]);
    expect(parts).not.toBe(history_key([{ role: "user", content: "hi" }]));
  });
});

describe("has_image", () => {
  test("finds a picture in any message", () => {
    expect(has_image([{ role: "user", content: "hi" }])).toBe(false);
    expect(has_image([{ role: "user", content: [{ type: "text", value: "hi" }] }])).toBe(false);
    expect(
      has_image([
        { role: "user", content: [{ type: "image", value: new Blob() }] },
        { role: "user", content: "and?" },
      ])
    ).toBe(true);
  });
});

import { describe, expect, test } from "vitest";
import { AppCategory, type AppListing } from "./type";
import type { AiMessage, AiService } from "../ai/type";
import { build_sentence_index, query_terms, rank_sentence, stem, suggest_keywords, suggest_messages } from "./sentence";

const app = (name: string, extra: Partial<AppListing> = {}) =>
  ({ id: name.toLowerCase().replace(/\s+/g, "-"), name, category: AppCategory.UTILITIES, system: false, ...extra }) as AppListing;

const APPS = [
  app("Hopsprite", { category: AppCategory.MEDIA, keywords: ["pixel art", "sprite"], description: "Draw sprites one pixel at a time." }),
  app("Paint", { category: AppCategory.MEDIA, keywords: ["draw", "brush"], description: "Paint and draw on a canvas." }),
  app("Quick Notes", { category: AppCategory.PRODUCTIVITY, keywords: ["notes", "todo"], description: "Capture a note or a todo." }),
  app("Recorder", { category: AppCategory.MEDIA, keywords: ["audio", "microphone"], description: "Record your voice." }),
  app("Recipe Box", {
    category: AppCategory.PRODUCTIVITY,
    keywords: ["cooking", "kitchen"],
    description: "Your recipes.",
    pitch: { problem: "Dinner needs a timer.", solution: "Cook with steps and timers." },
  }),
];
const index = build_sentence_index(APPS);
const ids = (list: AppListing[]) => list.map((manifest) => manifest.id);

describe("stem", () => {
  test("strips common endings from longer words only", () => {
    expect(stem("logging")).toBe("logg");
    expect(stem("timers")).toBe(stem("timer"));
    expect(stem("notes")).toBe("not");
    expect(stem("cats")).toBe("cats");
  });
});

describe("query_terms", () => {
  test("drops stop words", () => {
    expect(query_terms(index, "tool that allows me to make pixelart")).toEqual(["pixelart"]);
  });

  test("joins neighbours the apps know as one word", () => {
    expect(query_terms(index, "to do list")).toEqual(["todo", "list"]);
    expect(query_terms(index, "pixel art")).toEqual(["pixelart"]);
  });

  test("keeps stop words when nothing else is left", () => {
    expect(query_terms(index, "make it")).toEqual(["make", "it"]);
  });
});

describe("rank_sentence", () => {
  test("a joined keyword finds the app written either way", () => {
    expect(ids(rank_sentence(index, "tool that allows me to make pixelart"))[0]).toBe("hopsprite");
    expect(ids(rank_sentence(index, "pixel art editor"))[0]).toBe("hopsprite");
  });

  test("two words of a description also match written as one", () => {
    const own = build_sentence_index([app("Canvas", { description: "Sketch with a fine brush." }), app("Other")]);
    expect(ids(rank_sentence(own, "finebrush"))).toEqual(["canvas"]);
  });

  test("the name outweighs the description", () => {
    expect(ids(rank_sentence(index, "paint"))[0]).toBe("paint");
  });

  test("searches the pitch", () => {
    expect(ids(rank_sentence(index, "something for dinner"))).toEqual(["recipe-box"]);
  });

  test("stemmed words match", () => {
    expect(ids(rank_sentence(index, "recording my voice"))[0]).toBe("recorder");
  });

  test("drops results far below the best", () => {
    expect(ids(rank_sentence(index, "draw sprites"))).toEqual(["hopsprite"]);
  });

  test("no words, no results", () => {
    expect(rank_sentence(index, "  ")).toEqual([]);
    expect(rank_sentence(index, "zzz")).toEqual([]);
  });
});

describe("suggest_keywords", () => {
  test("asks the model with the sentence last and keeps the non-empty keywords", async () => {
    let sent: AiMessage[] = [];
    const ai = {
      extract: async (messages: AiMessage[]) => {
        sent = messages;
        return { keywords: [" pixel art ", "", "sprite"] };
      },
    } as unknown as AiService;
    expect(await suggest_keywords(ai, "something for tiny game drawings")).toEqual(["pixel art", "sprite"]);
    expect(sent).toEqual(suggest_messages("something for tiny game drawings"));
    expect(sent.at(-1)).toEqual({ role: "user", content: "something for tiny game drawings" });
  });
});

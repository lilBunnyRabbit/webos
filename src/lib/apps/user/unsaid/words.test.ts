import { describe, expect, test } from "vitest";
import { guess_key, is_hit, stem, tokens, violations } from "./words";

describe("stem", () => {
  test("word forms meet", () => {
    for (const group of [
      ["bake", "baked", "baker", "baking", "bakes"],
      ["horse", "horses"],
      ["run", "running"],
      ["fly", "flies"],
      ["class", "classes"],
      ["quick", "quickly"],
      ["eye", "eyes"],
    ]) {
      expect(new Set(group.map(stem)).size, group.join(" ")).toBe(1);
    }
  });

  test("short words keep their ending", () => {
    expect(stem("bed")).toBe("bed");
    expect(stem("bus")).toBe("bus");
    expect(stem("sing")).toBe("sing");
  });
});

describe("tokens", () => {
  test("splits on anything but letters and keeps positions", () => {
    expect(tokens("Ice-cream, 2 scoops!")).toEqual([
      { word: "ice", start: 0, end: 3 },
      { word: "cream", start: 4, end: 9 },
      { word: "scoops", start: 13, end: 19 },
    ]);
  });

  test("folds case and diacritics", () => {
    expect(tokens("Café NAÏVE").map((token) => token.word)).toEqual(["cafe", "naive"]);
    expect(tokens("Café")[0]).toEqual({ word: "cafe", start: 0, end: 5 });
  });
});

describe("violations", () => {
  const banned = ["ride", "saddle", "stable", "pony", "gallop"];

  test("a clean clue passes", () => {
    expect(violations("Big animal with a mane that farmers keep", "horse", banned)).toEqual([]);
  });

  test("the target is banned in any form", () => {
    expect(violations("Horses run", "horse", banned).map((v) => v.word)).toEqual(["horses"]);
    expect(violations("a horseshoe", "horse", banned).map((v) => v.banned)).toEqual(["horse"]);
  });

  test("banned words by stem and by prefix", () => {
    expect(violations("you RIDING it", "horse", banned)).toEqual([
      { word: "riding", start: 4, end: 10, banned: "ride" },
    ]);
    expect(violations("saddles and ponies", "horse", banned).map((v) => v.banned)).toEqual(["saddle", "pony"]);
    expect(violations("galloping", "horse", banned).map((v) => v.banned)).toEqual(["gallop"]);
  });

  test("diacritics don't sneak a word past", () => {
    expect(violations("pöny", "horse", banned).map((v) => v.banned)).toEqual(["pony"]);
  });

  test("short stems only ban the same word, not every word starting with them", () => {
    expect(violations("bedroom", "bed", ["sleep"])).toEqual([]);
    expect(violations("beds", "bed", ["sleep"]).map((v) => v.word)).toEqual(["beds"]);
  });

  test("reports every offending word with its place in the clue", () => {
    const found = violations("Ride it, then stable it", "horse", banned);
    expect(found.map(({ start, end }) => [start, end])).toEqual([
      [0, 4],
      [14, 20],
    ]);
  });
});

describe("is_hit", () => {
  test("any form of the target", () => {
    expect(is_hit("Horses", "horse")).toBe(true);
    expect(is_hit("the moon", "moon")).toBe(true);
    expect(is_hit("Pancakes", "pancake")).toBe(true);
  });

  test("a guess of several words hits when one of them is the target", () => {
    expect(is_hit("full moon", "moon")).toBe(true);
    expect(is_hit("honeymoon", "moon")).toBe(false);
  });

  test("a near word misses", () => {
    expect(is_hit("pony", "horse")).toBe(false);
    expect(is_hit("the", "the")).toBe(false);
  });
});

describe("guess_key", () => {
  test("ignores case, diacritics and articles", () => {
    expect(guess_key("The Moon")).toBe("moon");
    expect(guess_key("a CAFÉ")).toBe("cafe");
  });
});

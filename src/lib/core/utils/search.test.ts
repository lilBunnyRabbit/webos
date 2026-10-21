import { describe, expect, test } from "vitest";
import { search_ranked, type SearchText } from "./search";

interface Thing {
  label: string;
  keywords?: string[];
  where?: string;
}

const text_of = (thing: Thing): SearchText => ({ name: thing.label, keywords: thing.keywords ?? [], other: [thing.where ?? ""] });
const labels = (things: Thing[]) => things.map((thing) => thing.label);
const search = (things: Thing[], query: string) => labels(search_ranked(things, query, text_of, () => 0));

describe("search_ranked", () => {
  const things: Thing[] = [
    { label: "Show seconds", keywords: ["clock"], where: "Taskbar" },
    { label: "Text size", keywords: ["font size", "zoom"], where: "Text & interface" },
    { label: "Code font", keywords: ["monospace"], where: "Text & interface" },
  ];

  test("an empty query matches nothing", () => {
    expect(search(things, " ")).toEqual([]);
  });

  test("name before keywords before the other text", () => {
    expect(search(things, "size")).toEqual(["Text size"]);
    expect(search(things, "font")).toEqual(["Code font", "Text size"]);
    expect(search(things, "interface")).toEqual(["Text size", "Code font"]);
  });

  test("every word must match, and long words forgive a typo", () => {
    expect(search(things, "text zoom")).toEqual(["Text size"]);
    expect(search(things, "secnds")).toEqual(["Show seconds"]);
  });

  test("ties keep the caller's order", () => {
    const pair = [{ label: "Alpha mode" }, { label: "Beta mode" }];
    expect(labels(search_ranked(pair, "mode", text_of, (a, b) => b.label.localeCompare(a.label)))).toEqual(["Beta mode", "Alpha mode"]);
  });
});

import { describe, expect, test } from "vitest";
import { CODE_BLOCK, speakable, split_sentences, strip_markdown } from "./text";

describe("split_sentences", () => {
  test("cuts at sentence ends followed by whitespace and keeps the tail", () => {
    expect(split_sentences("Hello there. How are you? Fine! And")).toEqual({
      sentences: ["Hello there.", "How are you?", "Fine!"],
      rest: " And",
    });
  });

  test("a sentence end at the very end waits for the next chunk", () => {
    expect(split_sentences("Hello.")).toEqual({ sentences: [], rest: "Hello." });
  });

  test("ellipses and blank lines end sentences; decimals don't", () => {
    expect(split_sentences("Wait… what\n\nPi is 3.14 today. ").sentences).toEqual(["Wait…", "what", "Pi is 3.14 today."]);
  });

  test("streaming in pieces gives the same sentences as all at once", () => {
    const text = "One. Two three! Four?\n\nFive. ";
    let rest = "";
    const spoken: string[] = [];
    for (const piece of text.match(/.{1,3}/gs)!) {
      const split = split_sentences(rest + piece);
      spoken.push(...split.sentences);
      rest = split.rest;
    }
    expect(spoken).toEqual(split_sentences(text).sentences);
  });

  test("a numbered list marker isn't a sentence end", () => {
    expect(split_sentences("Steps:\n1. Boil water. ", true).sentences).toEqual(["Steps:", "1. Boil water."]);
  });

  test("markdown: list items and headings start sentences", () => {
    expect(split_sentences("## Shopping\n- milk\n- eggs\nmore", true)).toEqual({
      sentences: ["## Shopping", "- milk"],
      rest: "- eggs\nmore",
    });
  });

  test("markdown: a heading is a sentence of its own", () => {
    expect(split_sentences("# Tip\n**Run** it\nnow", true)).toEqual({ sentences: ["# Tip"], rest: "**Run** it\nnow" });
  });

  test("markdown: a closed code block is one sentence, an open one waits", () => {
    const closed = split_sentences("Run this.\n```js\nconst a = 1. b = 2;\n```\nThen go. ", true);
    expect(closed.sentences).toEqual(["Run this.", CODE_BLOCK, "Then go."]);

    const open = split_sentences("Like so:\n\n```py\nx = 1. y = 2. ", true);
    expect(open.sentences).toEqual(["Like so:"]);
    expect(open.rest).toBe("```py\nx = 1. y = 2. ");
  });

  test("markdown: two code blocks in a row", () => {
    expect(split_sentences("A. \n```\na\n```\nB. \n```\nb\n```\nC. ", true).sentences).toEqual(["A.", CODE_BLOCK, "B.", CODE_BLOCK, "C."]);
  });
});

describe("strip_markdown", () => {
  test("drops emphasis, headings, list markers and quotes", () => {
    expect(strip_markdown("# Title\n> **Bold** and *it* and _em_ and ~~gone~~\n- item\n1. first")).toBe(
      "Title\nBold and it and em and gone\nitem\nfirst"
    );
  });

  test("links and images read as their text, inline code as its text", () => {
    expect(strip_markdown("See [the docs](https://x.y) and ![a cat](c.png), run `ls -la`.")).toBe("See the docs and a cat, run ls -la.");
  });

  test("code blocks read as Code block.", () => {
    expect(strip_markdown("Before\n```ts\nconst x = 1;\n```\nAfter")).toBe(`Before\n${CODE_BLOCK}\nAfter`);
  });

  test("snake_case words and lone asterisks stay", () => {
    expect(strip_markdown("use get_app_context and 2 * 3 * 4")).toBe("use get_app_context and 2 * 3 * 4");
  });

  test("tables read row by row, separators dropped", () => {
    expect(strip_markdown("| Name | Qty |\n|---|---|\n| Milk | 2 |")).toBe("Name, Qty\nMilk, 2");
  });
});

describe("speakable", () => {
  test("collapses whitespace and skips symbol-only text", () => {
    expect(speakable("  Hello\n  world ", false)).toBe("Hello world");
    expect(speakable("---", true)).toBe("");
    expect(speakable("- **Milk**", true)).toBe("Milk");
  });
});

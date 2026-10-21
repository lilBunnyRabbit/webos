import { describe, expect, test } from "vitest";
import { parse_content, parse_notebook, section_of, serialize_content, serialize_notebook, VERSION } from "./format";
import { ImageDisplay, normalize_content, ProposalStatus, type Content, type Notebook, type Run } from "./model";

const PIXEL = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
const OTHER = "data:image/png;base64,iVBORw0KGgo=";

const inline = (image = PIXEL): Run => ({ image, display: ImageDisplay.INLINE });
const block = (image = PIXEL): Run => ({ image, display: ImageDisplay.BLOCK });

const strip_ids = (notebook: Notebook) => ({
  ...notebook,
  proposals: notebook.proposals.map(({ id: _id, ...rest }) => rest),
});

const round_trip = (content: Content) => parse_content(serialize_content(content).split("\n"));

describe("content", () => {
  test("text with inline and block images survives a round trip", () => {
    const content: Content = [
      { text: "The cursor is boring " },
      inline(),
      { text: " and static.\n\nSecond paragraph" },
      block(),
      { text: "\nafter the block" },
      block(OTHER),
      block(),
    ];
    expect(round_trip(content)).toEqual(normalize_content(content));
  });

  test("an inline image writes as ![]() within its line, a block as ![block]() on its own", () => {
    const text = serialize_content([{ text: "a " }, inline(), { text: " b" }, block()]);
    expect(text).toBe(`a ![](${PIXEL}) b\n![block](${PIXEL})`);
  });

  test("markdown-looking text is escaped and comes back unchanged", () => {
    const tricky = [
      "## not a proposal",
      "### Problem",
      "<!-- status: shipped -->",
      "<!-- proposals: 9 -->",
      "![block](data:image/webp;base64,AAAA)",
      "a ![](data:image/webp;base64,AAAA) b",
      "C:\\path\\to\\file \\ trailing\\",
      "\\! \\# \\< \\\\",
      "#tag",
    ].join("\n");
    expect(round_trip([{ text: tricky }])).toEqual([{ text: tricky }]);
  });

  test("random runs round-trip", () => {
    const alphabet = ["a", " ", "\n", "\\", "!", "[", "]", "(", ")", "#", "<", "!--", "-", ">", "block", "data:"];
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let trial = 0; trial < 500; trial++) {
      const content: Content = [];
      const count = 1 + Math.floor(random() * 6);
      for (let index = 0; index < count; index++) {
        const pick = random();
        if (pick < 0.15) content.push(inline());
        else if (pick < 0.25) content.push(block(OTHER));
        else {
          let text = "";
          const length = Math.floor(random() * 12);
          for (let char = 0; char < length; char++) text += alphabet[Math.floor(random() * alphabet.length)];
          content.push({ text });
        }
      }
      expect(round_trip(content)).toEqual(normalize_content(content));
    }
  });
});

describe("notebook", () => {
  const notebook: Notebook = {
    title: "Proposals",
    proposals: [
      {
        id: "a",
        title: "Pew Pew 2",
        status: ProposalStatus.SENT,
        sections: {
          problem: [{ text: "The cursor is boring " }, inline(), { text: " and static." }, block()],
          feel: [{ text: "Loud." }],
        },
      },
      { id: "b", title: "Empty one", status: ProposalStatus.DRAFT, sections: {} },
    ],
  };

  test("serialize then parse gives the same notebook", () => {
    expect(strip_ids(parse_notebook(serialize_notebook(notebook)))).toEqual(strip_ids(notebook));
  });

  test("writes the version marker, the status and only filled sections, in order", () => {
    const text = serialize_notebook(notebook);
    expect(text.startsWith(`<!-- proposals: ${VERSION} -->\n# Proposals\n\n## Pew Pew 2\n<!-- status: sent -->\n\n### Problem\n`)).toBe(true);
    expect(text).toContain("### Feel and name\nLoud.\n");
    expect(text).not.toContain("### Picture");
    expect(text.indexOf("### Problem")).toBeLessThan(text.indexOf("### Feel and name"));
  });

  test("a newer format is refused", () => {
    expect(() => parse_notebook("<!-- proposals: 2 -->\n# Proposals")).toThrow(/newer/);
  });

  test("hand edits: CRLF, unknown headings, stray text, odd status, aliases, repeated sections", () => {
    const source = [
      "Loose note at the top",
      "",
      "## Idea",
      "<!-- status: SHIPPED -->",
      "intro before any section",
      "### Problem",
      "first",
      "### Mood board",
      "under an unknown heading",
      "### first version vs later",
      "small",
      "### Problem",
      "again",
      "## ",
      "<!-- status: bogus -->",
      "### Background",
      "only unknown",
    ].join("\r\n");
    const parsed = parse_notebook(source);
    expect(parsed.title).toBe("Proposals");
    expect(parsed.proposals.map((proposal) => [proposal.title, proposal.status])).toEqual([
      ["Untitled proposal", "draft"],
      ["Idea", "shipped"],
      ["", "draft"],
    ]);
    expect(parsed.proposals[0].sections.problem).toEqual([{ text: "Loose note at the top" }]);
    expect(parsed.proposals[1].sections.problem).toEqual([
      { text: "intro before any section\nfirst\nMood board\nunder an unknown heading\n\nagain" },
    ]);
    expect(parsed.proposals[1].sections.scope).toEqual([{ text: "small" }]);
    expect(parsed.proposals[2].sections.problem).toEqual([{ text: "Background\nonly unknown" }]);
  });

  test("a hand-written PNG data URL and a block image between blank lines", () => {
    const parsed = parse_notebook(`## A\n### Picture\nLook:\n\n![block](${OTHER})\n\n![x](${PIXEL}) inline`);
    expect(parsed.proposals[0].sections.picture).toEqual([{ text: "Look:\n" }, block(OTHER), { text: "\n" }, inline(), { text: " inline" }]);
  });

  test("a broken image stays as text", () => {
    const parsed = parse_notebook("## A\n### Picture\n![](https://example.com/a.png)");
    expect(parsed.proposals[0].sections.picture).toEqual([{ text: "![](https://example.com/a.png)" }]);
  });

  test("section labels match loosely", () => {
    expect(section_of("What it does")).toBe("does");
    expect(section_of("  feel & name ")).toBe("feel");
    expect(section_of("Real Example")).toBe("example");
    expect(section_of("Whatever")).toBeNull();
  });
});

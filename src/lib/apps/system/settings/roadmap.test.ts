import { describe, expect, test } from "vitest";
import { count_status, ItemStatus, parse_roadmap, plain } from "./roadmap";

const SAMPLE = `# WebOS Implementation Roadmap

Intro text with [a link](x.md).

## P0 — Core

### Files
- **ADR:** [ADR-005](adrs/005.md)
- [x] Hierarchy (\`/home\`, [ADR-021](a.md))
- [-] Back/forward buttons
  - [ ] Forward
- [ ] ~~Old idea~~ dropped

## Open bugs

- [x] **Windows stranded** after a resize
`;

describe("parse_roadmap", () => {
  const sections = parse_roadmap(SAMPLE);

  test("groups items under ## and ### headings and skips plain lines", () => {
    expect(sections.map((section) => `${section.group} / ${section.title}`)).toEqual(["P0 — Core / Files", "Open bugs / Open bugs"]);
  });

  test("reads status, nesting and plain text", () => {
    expect(sections[0].items).toEqual([
      { status: ItemStatus.DONE, text: "Hierarchy (/home, ADR-021)", depth: 0 },
      { status: ItemStatus.PARTIAL, text: "Back/forward buttons", depth: 0 },
      { status: ItemStatus.PLANNED, text: "Forward", depth: 1 },
      { status: ItemStatus.PLANNED, text: "Old idea dropped", depth: 0 },
    ]);
  });

  test("counts by status", () => {
    expect(count_status(sections)).toEqual({ done: 2, partial: 1, planned: 2 });
  });
});

test("plain strips inline markdown", () => {
  expect(plain("**Bold** [label](u) `code` ~~gone~~")).toBe("Bold label code gone");
});

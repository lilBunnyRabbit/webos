import { expect, test } from "vitest";
import { render_markdown } from "./markdown";

const IDS = new Set(["system/kernel", "system/services/windows", "adrs/002-x"]);

test("headings get GitHub's slugs and the first title is left to the reader", () => {
  const html = render_markdown("# Kernel\n\n## Behaviour & invariants\n\n## Behaviour & invariants\n", "system/kernel", IDS);
  expect(html).not.toContain("<h1");
  expect(html).toContain('id="behaviour--invariants"');
  expect(html).toContain('id="behaviour--invariants-1"');
});

test("links open docs in place, anchors in the page and the rest on GitHub", () => {
  const html = render_markdown(
    "[w](services/windows.md#api) [a](#top) [b](../brainstorm/x.md) [c](https://example.com)",
    "system/kernel",
    IDS
  );
  expect(html).toContain('data-doc="system/services/windows" data-hash="api"');
  expect(html).toContain('href="#top" data-hash="top"');
  expect(html).toContain('href="https://github.com/lilBunnyRabbit/webos/blob/master/docs/brainstorm/x.md" target="_blank"');
  expect(html).toContain('href="https://example.com" target="_blank"');
});

test("an ADR header becomes a status chip and revisions become callouts", () => {
  const html = render_markdown("# ADR-002: X\n**Date:** 2026-01-24\n**Status:** Implemented\n\n> **Revision 2026-10-10: built.** Text.\n\n> Plain quote\n", "adrs/002-x", IDS);
  expect(html).toMatch(/<p class="adr-meta"><span class="[^"]*text-success[^"]*">Implemented<\/span><time>2026-01-24<\/time><\/p>/);
  expect(html).toContain('<aside class="callout" data-kind="revision">');
  expect(html).toContain("<blockquote>");
});

test("tables scroll on their own and code is escaped", () => {
  const html = render_markdown("| a | b |\n|---|---|\n| `x` | <y> |\n\n```ts\nconst a = 1 < 2;\n```\n", "system/kernel", IDS);
  expect(html).toContain('<div class="table-wrap" tabindex="0"><table>');
  expect(html).toContain("const a = 1 &lt; 2;");
  expect(html).toContain('<span class="code-lang">ts</span>');
});

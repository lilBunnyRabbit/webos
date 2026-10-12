import { describe, expect, test } from "vitest";
import { BRAND_DARK } from "$lib/core/api/services/settings/themes";
import { preview_document, render_markdown } from "./markdown-preview";

describe("markdown preview", () => {
  test("renders GFM", async () => {
    const html = await render_markdown("# Title\n\n- [x] done\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<table>");
  });

  test("only the nonce'd script may run", () => {
    const doc = preview_document("<script>alert(1)</script>", BRAND_DARK, 120, "abc");
    expect(doc).toContain("script-src 'nonce-abc'");
    expect(doc).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(doc.match(/<script nonce="abc">/g)).toHaveLength(1);
    expect(doc).toContain("scrollTo(0, 120)");
  });

  test("passes the theme as variables", () => {
    expect(preview_document("", BRAND_DARK, 0, "n")).toContain(`--background-darkest:${BRAND_DARK.background_darkest}`);
  });
});

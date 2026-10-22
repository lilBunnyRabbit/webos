import { describe, expect, it } from "vitest";
import { export_html, export_markdown, in_range } from "./export";
import { media_token, type Entry } from "./journal";

const PHOTO = "f".repeat(32);
const entry = (id: string, date: string, body: string, created = 1): Entry => ({ id: id.repeat(32), date, created, updated: created, body });

describe("export", () => {
  const entries = [entry("a", "2026-10-03", "late"), entry("b", "2026-10-01", "first <b>"), entry("c", "2026-09-30", "before"), entry("d", "2026-10-03", "early", 0)];

  it("keeps the range, oldest first", () => {
    expect(in_range(entries, "2026-10-01", "2026-10-03").map((item) => item.body)).toEqual(["first <b>", "early", "late"]);
  });

  it("writes Markdown with photos as data URLs", () => {
    const text = export_markdown({
      title: "Journal",
      from: "2026-10-01",
      to: "2026-10-03",
      entries: [entry("a", "2026-10-01", `Lake ${media_token(PHOTO)} ${media_token("e".repeat(32))}`)],
      media: new Map([[PHOTO, "data:image/webp;base64,AAAA"]]),
    });
    expect(text).toMatch(/^# Journal\n\n2026-10-01 to 2026-10-03\n\n## .+2026.+\n\nLake !\[photo\]\(data:image\/webp;base64,AAAA\) \(photo missing\)\n$/);
  });

  it("escapes HTML and renders light Markdown for printing", () => {
    const html = export_html({
      title: "<Journal>",
      from: "2026-10-01",
      to: "2026-10-01",
      entries: [entry("a", "2026-10-01", `## Heading\n- one **two**\n- *three*\n<script>x</script>\n${media_token(PHOTO)}`)],
      media: new Map([[PHOTO, 'data:image/webp;base64,AAAA" onerror="x']]),
    });
    expect(html).toContain("&lt;Journal&gt;");
    expect(html).toContain("<h4>Heading</h4>");
    expect(html).toContain("<ul><li>one <strong>two</strong></li><li><em>three</em></li></ul>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("onerror");
  });
});

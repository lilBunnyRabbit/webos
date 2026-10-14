import { describe, expect, test } from "vitest";
import { render_markdown, slugger, toc_html } from "./render";

describe("render_markdown", () => {
  test("gives headings ids and collects them", () => {
    const { html, headings, title } = render_markdown("# Report\n\n## First *part*\n\n## First part\n\ntext");
    expect(html).toContain('<h1 id="report">Report</h1>');
    expect(html).toContain('<h2 id="first-part">First <em>part</em></h2>');
    expect(html).toContain('<h2 id="first-part-1">');
    expect(headings.map((h) => [h.depth, h.text])).toEqual([
      [1, "Report"],
      [2, "First part"],
      [2, "First part"],
    ]);
    expect(title).toBe("Report");
  });

  test("renders GFM tables, task lists and code", () => {
    const { html } = render_markdown("| a | b |\n|---|--:|\n| 1 | 2 |\n\n- [x] done\n\n```ts\nconst x = 1;\n```");
    expect(html).toContain("<table>");
    expect(html).toContain('align="right"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<code class="language-ts">');
  });

  test("no level-1 heading means no title", () => {
    expect(render_markdown("## Only a section").title).toBeNull();
  });

  test("counts words", () => {
    expect(render_markdown("Two words\n\n- and three more").words).toBe(5);
  });

  test("a new render starts slug numbering again", () => {
    render_markdown("## Same");
    expect(render_markdown("## Same").headings[0].id).toBe("same");
  });
});

describe("slugger", () => {
  test("drops punctuation, keeps letters from any script", () => {
    const slug = slugger();
    expect(slug("Hello, World!")).toBe("hello-world");
    expect(slug("Čas & prostor")).toBe("čas-prostor");
    expect(slug("???")).toBe("section");
  });
});

describe("toc_html", () => {
  test("a single level-1 title is left out; two levels below it are listed", () => {
    const { headings } = render_markdown("# Title\n\n## A\n\n### A.1\n\n#### deep\n\n## B & \`<C>\`");
    const toc = toc_html(headings);
    expect(toc).not.toContain("Title");
    expect(toc).toContain('<li class="toc-1"><a href="#a">A</a></li>');
    expect(toc).toContain('<li class="toc-2"><a href="#a1">A.1</a></li>');
    expect(toc).not.toContain("deep");
    expect(toc).toContain("B &amp; &lt;C&gt;");
  });

  test("several level-1 headings are the top level", () => {
    const { headings } = render_markdown("# One\n\n## Sub\n\n# Two");
    expect(toc_html(headings)).toContain('class="toc-1"><a href="#one"');
  });

  test("nothing to list gives nothing", () => {
    expect(toc_html([])).toBe("");
    expect(toc_html(render_markdown("# Just a title").headings)).toBe("");
  });
});

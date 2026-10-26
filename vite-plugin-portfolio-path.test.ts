import { describe, expect, test } from "vitest";
import { portfolio_html } from "./vite-plugin-portfolio-path";

describe("portfolio path", () => {
  test("the shell's HTML gains one script that defaults a bare visit to the Portfolio link and drops the query", () => {
    const html = portfolio_html("<html><head><title>WebOS</title></head><body></body></html>");
    expect(html).toContain(`history.replaceState(null, "", location.pathname + (location.hash || "#/solo/portfolio"))`);
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("</head>"));
    expect(html.match(/<script>/g)).toHaveLength(1);
  });
});

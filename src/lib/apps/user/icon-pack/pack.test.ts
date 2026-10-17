import { describe, expect, test } from "vitest";
import { DEFAULT_PACK, PackSchema, card_title, head_html, pack_name, parse_padding, web_manifest, wrap_lines } from "./pack";

const measure = (text: string) => text.length;

describe("wrap_lines", () => {
  test("wraps by words", () => {
    expect(wrap_lines("one two three four", 9, 3, measure)).toEqual(["one two", "three", "four"]);
  });

  test("ends the last line in an ellipsis when text is left over", () => {
    expect(wrap_lines("one two three four", 9, 2, measure)).toEqual(["one two", "three…"]);
  });

  test("cuts a word longer than the line", () => {
    expect(wrap_lines("abcdefghijkl", 6, 2, measure)).toEqual(["abcde…"]);
  });

  test("gives no lines for no text", () => {
    expect(wrap_lines("   ", 10, 2, measure)).toEqual([]);
  });
});

test("parse_padding takes a percent within range", () => {
  expect(parse_padding("10%")).toBe(10);
  expect(parse_padding("12.5")).toBe(12.5);
  expect(parse_padding("0%")).toBe(0);
  expect(parse_padding("41%")).toBeNull();
  expect(parse_padding("10px")).toBeNull();
});

test("names", () => {
  expect(pack_name("logo.svg")).toBe("logo-icons.zip");
  expect(pack_name(".hidden")).toBe(".hidden-icons.zip");
  expect(card_title({ ...DEFAULT_PACK.card, title: "  " }, "brand.png")).toBe("brand");
  expect(card_title({ ...DEFAULT_PACK.card, title: "My site" }, "brand.png")).toBe("My site");
});

test("the defaults pass the schema", () => {
  expect(PackSchema.safeParse(DEFAULT_PACK).success).toBe(true);
});

describe("snippets", () => {
  const info = { name: `A "quoted" <site>`, description: "", color: "#112233", svg: true };

  test("the manifest lists the PNGs, the maskable icon and the SVG", () => {
    const manifest = JSON.parse(web_manifest(info));
    expect(manifest.theme_color).toBe("#112233");
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual(["/favicon.svg", "/icon-192.png", "/icon-512.png", "/maskable-512.png"]);
    expect(manifest.icons.at(-1).purpose).toBe("maskable");
    expect(JSON.parse(web_manifest({ ...info, svg: false })).icons).toHaveLength(3);
  });

  test("head tags escape the title and skip what isn't there", () => {
    const head = head_html(info);
    expect(head).toContain(`content="A &quot;quoted&quot; &lt;site&gt;"`);
    expect(head).toContain(`<link rel="icon" href="/favicon.svg" type="image/svg+xml">`);
    expect(head).not.toContain("og:description");
    expect(head_html({ ...info, svg: false, description: "Hi" })).not.toContain("favicon.svg");
    expect(head_html({ ...info, description: "Hi" })).toContain(`<meta property="og:description" content="Hi">`);
  });
});

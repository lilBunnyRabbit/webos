import { describe, expect, test } from "vitest";
import { framed_svg, is_svg, sized_svg, svg_size, svg_warnings } from "./svg";

describe("svg_size", () => {
  test("reads width and height, or fills one in from the viewBox", () => {
    expect(svg_size(`<svg width="24" height="12"></svg>`)).toEqual({ width: 24, height: 12 });
    expect(svg_size(`<svg viewBox="0 0 100 50"></svg>`)).toEqual({ width: 100, height: 50 });
    expect(svg_size(`<svg width="200px" viewBox="0,0,100,50"></svg>`)).toEqual({ width: 200, height: 100 });
    expect(svg_size(`<svg width="100%" height="100%" viewBox="0 0 10 20"></svg>`)).toEqual({ width: 10, height: 20 });
  });

  test("doesn't take stroke-width for width", () => {
    expect(svg_size(`<svg stroke-width="2" viewBox="0 0 8 8"></svg>`)).toEqual({ width: 8, height: 8 });
  });

  test("has no size without numbers to go on", () => {
    expect(svg_size(`<svg></svg>`)).toBeNull();
    expect(svg_size(`not svg`)).toBeNull();
  });
});

describe("sized_svg", () => {
  test("sets the longer side and adds a viewBox so it scales instead of cropping", () => {
    const sized = sized_svg(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><path/></svg>`, 1024);
    expect(svg_size(sized)).toEqual({ width: 1024, height: 512 });
    expect(sized).toContain(`viewBox="0 0 24 12"`);
    expect(sized).toContain("<path/>");
  });

  test("keeps an existing viewBox", () => {
    const sized = sized_svg(`<svg viewBox="0 0 10 10" width="5" height="5"/>`, 100);
    expect(sized.match(/viewBox/g)).toHaveLength(1);
    expect(svg_size(sized)).toEqual({ width: 100, height: 100 });
  });
});

describe("framed_svg", () => {
  test("returns the SVG untouched without a background or padding", () => {
    const text = `<svg viewBox="0 0 1 1"/>`;
    expect(framed_svg(text, { background: null, padding: 0 })).toBe(text);
  });

  test("nests the SVG in a padded square with a background", () => {
    const framed = framed_svg(`<?xml version="1.0"?><svg viewBox="0 0 4 2" width="4" height="2"><circle/></svg>`, {
      background: "#123456",
      padding: 10,
    });
    expect(framed.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#123456"/>`)).toBe(true);
    expect(framed).not.toContain("<?xml");
    expect(framed).toMatch(/<svg x="10" y="10" width="80" height="80" viewBox="0 0 4 2">/);
    expect(framed).toContain("<circle/>");
  });
});

describe("svg_warnings", () => {
  test("flags external images, styles and fonts", () => {
    const warnings = svg_warnings(`<svg>
      <style>@import url("https://fonts.example/a.css"); @font-face { font-family: X; }</style>
      <image href="photo.png"/>
      <use href="#local"/>
      <rect fill="url(#gradient)"/>
      <image href="data:image/png;base64,AAAA"/>
    </svg>`);
    expect(warnings.some((warning) => warning.includes("photo.png"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("https://fonts.example/a.css"))).toBe(true);
    expect(warnings.some((warning) => warning.startsWith("Imports a stylesheet"))).toBe(true);
    expect(warnings.some((warning) => warning.startsWith("Loads a web font"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("#local") || warning.includes("#gradient") || warning.includes("data:"))).toBe(false);
  });

  test("flags text in a named font but not in a generic one", () => {
    expect(svg_warnings(`<svg><text font-family="'Montserrat', sans-serif">Hi</text></svg>`)).toEqual([
      "Uses the font Montserrat: its text only looks right where it's installed. Convert text to paths.",
    ]);
    expect(svg_warnings(`<svg><text font-family="sans-serif">Hi</text></svg>`)).toEqual([]);
    expect(svg_warnings(`<svg font-family="Montserrat"><path/></svg>`)).toEqual([]);
  });

  test("passes a plain icon", () => {
    expect(svg_warnings(`<svg viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>`)).toEqual([]);
  });
});

test("is_svg by type or extension", () => {
  expect(is_svg({ name: "a.svg", type: "" })).toBe(true);
  expect(is_svg({ name: "a", type: "image/svg+xml" })).toBe(true);
  expect(is_svg({ name: "a.png", type: "image/png" })).toBe(false);
});

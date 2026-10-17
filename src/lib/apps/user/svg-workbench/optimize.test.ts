import { describe, expect, test } from "vitest";
import {
  DEFAULT_OPTIONS,
  byte_size,
  component_name,
  optimize_svg,
  optimized_name,
  png_name,
  png_size,
  svg_size,
  svgo_config,
} from "./optimize";

const ICON = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: an editor -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <title>Arrow</title>
  <defs><linearGradient id="a-very-long-gradient-id"><stop offset="0" stop-color="#ff0000"/></linearGradient></defs>
  <path id="first" fill="url(#a-very-long-gradient-id)" d="M 1.123456 2.987654 L 10.500000 10.500000 Z"/>
  <path id="second" fill="#000000" d="M 3 3 L 4 4 Z"/>
</svg>`;

describe("svgo_config", () => {
  test("the default is preset-default with precision and multipass", () => {
    expect(svgo_config(DEFAULT_OPTIONS)).toEqual({
      multipass: true,
      floatPrecision: 3,
      plugins: [{ name: "preset-default", params: { overrides: {} } }],
      js2svg: undefined,
    });
  });

  test("toggles turn preset plugins off and add the extra ones", () => {
    const config = svgo_config({ ...DEFAULT_OPTIONS, keep_ids: true, merge_paths: false, strip_size: true, strip_title: true, pretty: true });
    expect(config.plugins).toEqual([
      { name: "preset-default", params: { overrides: { cleanupIds: false, mergePaths: false } } },
      "removeDimensions",
      "removeTitle",
    ]);
    expect(config.js2svg).toEqual({ pretty: true, indent: 2 });
  });
});

describe("optimize_svg", () => {
  test("drops the prolog and comments, rounds numbers and shortens ids", async () => {
    const out = await optimize_svg(ICON, DEFAULT_OPTIONS);
    expect(out).not.toContain("<?xml");
    expect(out).not.toContain("Generator");
    expect(out).not.toContain("1.123456");
    expect(out).not.toContain("a-very-long-gradient-id");
    expect(out).toContain("<title>Arrow</title>");
    expect(byte_size(out)).toBeLessThan(byte_size(ICON));
  });

  test("precision sets how many decimals survive", async () => {
    expect(await optimize_svg(ICON, { ...DEFAULT_OPTIONS, precision: 1 })).toContain("1.1");
    expect(await optimize_svg(ICON, { ...DEFAULT_OPTIONS, precision: 5 })).toContain("1.12346");
  });

  test("keep ids, strip size and strip title", async () => {
    const out = await optimize_svg(ICON, { ...DEFAULT_OPTIONS, keep_ids: true, strip_size: true, strip_title: true });
    expect(out).toContain("a-very-long-gradient-id");
    expect(out).not.toMatch(/\swidth=/);
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).not.toContain("<title>");
  });

  test("pretty output is indented", async () => {
    expect(await optimize_svg(ICON, { ...DEFAULT_OPTIONS, pretty: true })).toContain("\n  <");
  });

  test("rejects text that isn't SVG markup", async () => {
    await expect(optimize_svg("<svg><g></svg>", DEFAULT_OPTIONS)).rejects.toThrow();
  });
});

describe("svg_size", () => {
  test("width and height win", () => {
    expect(svg_size('<svg width="48" height="32px" viewBox="0 0 10 10">')).toEqual({ width: 48, height: 32 });
  });

  test("one side and the viewBox ratio give the other", () => {
    expect(svg_size('<svg width="100" viewBox="0 0 200 50">')).toEqual({ width: 100, height: 25 });
    expect(svg_size("<svg height='10' viewBox='0,0,20,10'>")).toEqual({ width: 20, height: 10 });
  });

  test("relative sizes fall back to the viewBox, then 300 × 150", () => {
    expect(svg_size('<svg width="100%" height="100%" viewBox="0 0 64 32">')).toEqual({ width: 64, height: 32 });
    expect(svg_size("<svg>")).toEqual({ width: 300, height: 150 });
    expect(svg_size("not svg")).toEqual({ width: 300, height: 150 });
  });
});

test("png_size scales the longest side", () => {
  expect(png_size({ width: 24, height: 24 }, 512)).toEqual({ width: 512, height: 512 });
  expect(png_size({ width: 200, height: 50 }, 64)).toEqual({ width: 64, height: 16 });
  expect(png_size({ width: 1000, height: 1 }, 16)).toEqual({ width: 16, height: 1 });
});

test("names", () => {
  expect(optimized_name("logo.svg")).toBe("logo.min.svg");
  expect(optimized_name("logo.min.svg")).toBe("logo.min.svg");
  expect(png_name("logo.svg", 64)).toBe("logo-64.png");
  expect(component_name("arrow-left.svg")).toBe("ArrowLeft");
  expect(component_name("icon_check.min.svg")).toBe("IconCheck");
  expect(component_name("24-hours.svg")).toBe("Svg24Hours");
  expect(component_name("---.svg")).toBe("Icon");
});

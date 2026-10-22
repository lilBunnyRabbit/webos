import { describe, expect, test } from "vitest";

const ICONS = import.meta.glob<string>("./*/*/icon.svg", { query: "?raw", import: "default", eager: true });
const MANIFESTS = Object.keys(import.meta.glob("./*/*/index.ts"));
const LAYERS = ["primary", "secondary"] as const;

// AppIcon draws `icon.svg`, `icon.svg#primary` and `icon.svg#secondary` as three masks (ADR-066). A file without the views
// would draw its whole art in every layer; a colour written into the file is lost, since a mask only reads alpha.
describe("app icon files", () => {
  test("every app has one", () => {
    expect(MANIFESTS.map((path) => path.replace(/index\.ts$/, "icon.svg")).filter((path) => !(path in ICONS))).toEqual([]);
  });

  test.each(Object.entries(ICONS))("%s follows the layer convention", (_, svg) => {
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24">/);
    expect(svg).not.toMatch(/var\(--/);
    expect(svg).toContain("<style>.primary,.secondary,:target~*{display:none}#primary:target~.primary,#secondary:target~.secondary{display:inline}</style>");
    for (const layer of LAYERS) {
      expect(svg).toContain(`<view id="${layer}"/>`);
      if (svg.includes(`class="${layer}"`)) expect(svg.indexOf(`<view id="${layer}"/>`)).toBeLessThan(svg.indexOf(`class="${layer}"`));
    }
  });
});

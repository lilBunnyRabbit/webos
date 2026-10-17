import { compile } from "svelte/compiler";
import { describe, expect, test } from "vitest";
import { paint_colors, svelte_component } from "./component";

const ICON = `<?xml version="1.0"?><!-- c --><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000"><path d="M1 2h3"/><circle cx="5" cy="5" r="2" style="stroke:#000;opacity:.5"/></svg>`;
const MULTI = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><style>.a{fill:red}</style><rect class="a" width="4" height="4"/><rect x="4" fill="#00f" width="4" height="4"/><text>{x}</text></svg>`;

const compiles = (source: string) => compile(source, { generate: "server", filename: "Icon.svelte" }).js.code;

test("paint_colors lists solid paints only", async () => {
  expect(await paint_colors(ICON)).toEqual(["#000"]);
  expect(await paint_colors('<svg><path fill="url(#a)"/><path fill="none" stroke="currentColor"/></svg>')).toEqual(["currentcolor"]);
});

describe("svelte_component", () => {
  test("recolor puts every solid paint on the color prop and sizes the root", async () => {
    const source = await svelte_component(ICON, { size: 20, recolor: true });
    expect(source).toContain(`let { size = 20, color = "currentColor", ...rest }: Props = $props();`);
    expect(source).toContain(`<svg viewBox="0 0 24 24" fill="none" stroke={color} width={size} height={size} {...rest}>`);
    expect(source).toContain(`style="stroke:{color};opacity:.5"`);
    expect(source).not.toContain("#000");
    expect(source).not.toContain("xmlns");
    expect(source).not.toContain("<!--");
    expect(compiles(source)).toContain("stroke: color");
  });

  test("a root without fill gets the color, so default black paths follow it", async () => {
    const source = await svelte_component('<svg viewBox="0 0 1 1"><path d="M0 0h1"/></svg>', { size: 24, recolor: true });
    expect(source).toContain(`<svg viewBox="0 0 1 1" fill={color} width={size} height={size} {...rest}>`);
  });

  test("without recolor colours stay, braces in text are escaped and <style> stays raw", async () => {
    const source = await svelte_component(MULTI, { size: 24, recolor: false });
    expect(source).not.toContain("color?: string");
    expect(source).toContain("#00f");
    expect(source).toContain(".a{fill:red}");
    expect(source).toContain(`<text>{'{'}x{'}'}</text>`);
    const code = compiles(source);
    expect(code).toContain("<text>{x}</text>");
    expect(code).toContain(".a{fill:red}");
  });
});

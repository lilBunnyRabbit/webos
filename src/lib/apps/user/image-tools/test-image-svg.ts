import {
  Gradient,
  hsl_rgb,
  overlay_marks,
  Pattern,
  rgb_css,
  ring_schemes,
  TestFormat,
  type Mark,
  type TestImageSpec,
} from "./test-image";

const escape = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

function checker(id: string, cell: number, a: string, b: string): string {
  const size = cell * 2;
  return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><rect width="${size}" height="${size}" fill="${a}"/><rect width="${cell}" height="${cell}" fill="${b}"/><rect x="${cell}" y="${cell}" width="${cell}" height="${cell}" fill="${b}"/></pattern>`;
}

function base(spec: TestImageSpec): { defs: string; body: string } {
  const { width: W, height: H } = spec;
  const full = (fill: string) => `<rect width="${W}" height="${H}" fill="${fill}"/>`;
  switch (spec.pattern) {
    case Pattern.SOLID:
      return { defs: "", body: full(spec.color) };
    case Pattern.CHECKER:
      // Cell (0, 0) takes the first colour, as in the raster: the pattern's corner squares are the second.
      return { defs: checker("c", spec.cell, spec.color_2, spec.color), body: full("url(#c)") };
    case Pattern.RINGS: {
      const schemes = ring_schemes(spec);
      const defs = schemes.map(([light, dark], index) => checker(`r${index}`, spec.cell, rgb_css(dark), rgb_css(light))).join("");
      const cols = Math.ceil(W / spec.cell);
      const rows = Math.ceil(H / spec.cell);
      const rings = Math.ceil(Math.min(cols, rows) / 2);
      const paths: string[] = [];
      for (let ring = 0; ring < rings; ring++) {
        const outer = [ring * spec.cell, ring * spec.cell, Math.min(W, (cols - ring) * spec.cell), Math.min(H, (rows - ring) * spec.cell)];
        const inner = [(ring + 1) * spec.cell, (ring + 1) * spec.cell, Math.min(W, (cols - ring - 1) * spec.cell), Math.min(H, (rows - ring - 1) * spec.cell)];
        let d = `M${outer[0]} ${outer[1]}H${outer[2]}V${outer[3]}H${outer[0]}Z`;
        if (inner[2] > inner[0] && inner[3] > inner[1]) d += `M${inner[0]} ${inner[1]}V${inner[3]}H${inner[2]}V${inner[1]}Z`;
        paths.push(`<path d="${d}" fill="url(#r${ring % schemes.length})" fill-rule="evenodd"/>`);
      }
      return { defs, body: paths.join("") };
    }
    case Pattern.GRADIENT: {
      const stops = `<stop offset="0" stop-color="${spec.color}"/><stop offset="1" stop-color="${spec.color_2}"/>`;
      if (spec.gradient === Gradient.RADIAL)
        return {
          defs: `<radialGradient id="g" cx="${W / 2}" cy="${H / 2}" r="${Math.hypot(W / 2, H / 2)}" gradientUnits="userSpaceOnUse">${stops}</radialGradient>`,
          body: full("url(#g)"),
        };
      const [x2, y2] = spec.gradient === Gradient.HORIZONTAL ? [1, 0] : spec.gradient === Gradient.VERTICAL ? [0, 1] : [1, 1];
      return { defs: `<linearGradient id="g" x2="${x2}" y2="${y2}">${stops}</linearGradient>`, body: full("url(#g)") };
    }
    case Pattern.SPECTRUM: {
      const s = spec.saturation / 100;
      const hues = Array.from({ length: 13 }, (_, index) => `<stop offset="${index / 12}" stop-color="${rgb_css(hsl_rgb(index / 12, s, 0.5))}"/>`).join("");
      const shade = `<stop offset="0" stop-color="#fff" stop-opacity="0.8"/><stop offset="0.5" stop-color="#808080" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/>`;
      return {
        defs: `<linearGradient id="h">${hues}</linearGradient><linearGradient id="l" x2="0" y2="1">${shade}</linearGradient>`,
        body: full("url(#h)") + full("url(#l)"),
      };
    }
    case Pattern.NOISE:
      return {
        defs: `<filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${spec.seed}"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter>`,
        body: `<rect width="${W}" height="${H}" filter="url(#n)"/>`,
      };
  }
}

function mark_svg(mark: Mark): string {
  if (mark.kind === "rect") return `<rect x="${mark.x}" y="${mark.y}" width="${mark.width}" height="${mark.height}" fill="${mark.color}"/>`;
  const anchor = mark.align === "left" ? "start" : mark.align === "center" ? "middle" : "end";
  const pad = mark.size * 0.3;
  const x = mark.align === "left" ? mark.x + pad : mark.align === "right" ? mark.x - pad : mark.x;
  const height = mark.size * 1.4;
  const middle = mark.baseline === "top" ? mark.y + height / 2 : mark.baseline === "bottom" ? mark.y - height / 2 : mark.y;
  const text = `<text x="${x}" y="${middle}" font-size="${mark.size}" text-anchor="${anchor}" dominant-baseline="central" fill="${mark.color}">${escape(mark.text)}</text>`;
  if (!mark.plate) return text;
  const width = mark.text.length * mark.size * 0.62 + pad * 2;
  const left = mark.align === "left" ? mark.x : mark.align === "center" ? mark.x - width / 2 : mark.x - width;
  return `<rect x="${left}" y="${middle - height / 2}" width="${width}" height="${height}" rx="${mark.size * 0.2}" fill="${mark.plate}"/>${text}`;
}

export function test_image_svg(spec: TestImageSpec): string {
  const { width: W, height: H } = spec;
  const { defs, body } = base(spec);
  const marks = overlay_marks(spec, { x: 0, y: 0, width: W, height: H }, TestFormat.SVG).map(mark_svg).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" font-family="ui-monospace, Menlo, Consolas, monospace"><defs>${defs}</defs>${body}${marks}</svg>`;
}


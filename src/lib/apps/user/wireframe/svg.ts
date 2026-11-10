import type { Ink, Vec3, Wire } from "./model";
import type { Orbit } from "./projection";
import { build_scene, fitted_view, LABEL_FONT } from "./scene";

export interface Palette {
  paper: string;
  ink: string;
  chip: string;
  line: (color: Ink) => string;
}

const SIDE = 1000;
const MARGIN = 48;
const MONO = "Hack, ui-monospace, Menlo, Consolas, monospace";

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const n = (value: number) => Math.round(value * 10) / 10;

export function wire_svg(wire: Wire, orbit: Orbit, pivot: Vec3, palette: Palette): string | null {
  if (!wire.points.length) return null;
  const view = fitted_view(wire, orbit, pivot, SIDE, SIDE, MARGIN);
  const scene = build_scene(wire, { orbit, pivot, view });
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const point of scene.points) take(point.at.x, point.at.y);
  for (const label of scene.labels) {
    take(label.rect.x, label.rect.y);
    take(label.rect.x + label.rect.w, label.rect.y + label.rect.h);
  }
  const pad = 16;
  const box = { x: x0 - pad, y: y0 - pad, w: Math.ceil(x1 - x0 + pad * 2), h: Math.ceil(y1 - y0 + pad * 2) };
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box.w}" height="${box.h}" viewBox="${n(box.x)} ${n(box.y)} ${box.w} ${box.h}">`,
    `<rect x="${n(box.x)}" y="${n(box.y)}" width="${box.w}" height="${box.h}" fill="${palette.paper}"/>`,
  ];
  for (const line of scene.lines)
    out.push(
      `<line x1="${n(line.a.x)}" y1="${n(line.a.y)}" x2="${n(line.b.x)}" y2="${n(line.b.y)}" stroke="${palette.line(line.color)}" stroke-width="2" stroke-linecap="round"/>`
    );
  for (const point of scene.points)
    out.push(`<circle cx="${n(point.at.x)}" cy="${n(point.at.y)}" r="2.5" fill="${palette.ink}"/>`);
  for (const label of scene.labels) {
    const { x, y, w, h } = label.rect;
    out.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="3" fill="${palette.chip}"/>`,
      `<text x="${n(x + w / 2)}" y="${n(y + h / 2)}" dominant-baseline="central" text-anchor="middle" font-family="${MONO}" font-size="${LABEL_FONT}" fill="${palette.ink}">${escape(label.text)}</text>`
    );
  }
  out.push("</svg>");
  return `${out.join("\n")}\n`;
}

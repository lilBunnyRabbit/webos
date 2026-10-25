import { fit_view } from "$kit/utils/view";
import type { Rect } from "./labels";
import { build_scene, LABEL_FONT, NOTE_FONT, sketch_bounds, type Scene } from "./scene";
import type { Point, Sketch } from "./model";

export interface Palette {
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  chip: string;
}

const MARGIN = 24;
const EXPORT_SIDE = 900;
const MONO = "Hack, ui-monospace, Menlo, Consolas, monospace";
const SANS = "Inter, system-ui, sans-serif";

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const n = (value: number) => Math.round(value * 10) / 10;
const points = (list: Point[]) => list.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");

export function export_scene(sketch: Sketch): { scene: Scene; box: Rect } | null {
  const bounds = sketch_bounds(sketch);
  if (!bounds) return null;
  const view = fit_view(Math.max(bounds.w, 1), Math.max(bounds.h, 1), EXPORT_SIDE, EXPORT_SIDE, 0);
  const scene = build_scene(sketch, { ...view, offset_x: -bounds.x * view.scale, offset_y: -bounds.y * view.scale });
  const area = scene.bounds!;
  return { scene, box: { x: area.x - MARGIN, y: area.y - MARGIN, w: area.w + MARGIN * 2, h: area.h + MARGIN * 2 } };
}

export function scene_svg(scene: Scene, box: Rect, palette: Palette): string {
  const out: string[] = [];
  const width = Math.ceil(box.w);
  const height = Math.ceil(box.h);
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${n(box.x)} ${n(box.y)} ${width} ${height}">`,
    `<rect x="${n(box.x)}" y="${n(box.y)}" width="${width}" height="${height}" fill="${palette.paper}"/>`
  );
  for (const item of scene.boxes) {
    for (const face of item.faces)
      out.push(`<polygon points="${points(face)}" fill="${palette.ink}" fill-opacity="0.05"/>`);
    for (const line of item.hidden) {
      out.push(
        `<line x1="${n(line.a.x)}" y1="${n(line.a.y)}" x2="${n(line.b.x)}" y2="${n(line.b.y)}" stroke="${palette.muted}" stroke-width="1.25" stroke-dasharray="4 4"/>`
      );
    }
    for (const line of item.visible) {
      out.push(
        `<line x1="${n(line.a.x)}" y1="${n(line.a.y)}" x2="${n(line.b.x)}" y2="${n(line.b.y)}" stroke="${palette.ink}" stroke-width="2" stroke-linecap="round"/>`
      );
    }
  }
  for (const dim of scene.dims) {
    for (const line of [{ a: dim.a, b: dim.b }, ...dim.extensions]) {
      out.push(
        `<line x1="${n(line.a.x)}" y1="${n(line.a.y)}" x2="${n(line.b.x)}" y2="${n(line.b.y)}" stroke="${palette.muted}" stroke-width="1.25"/>`
      );
    }
    for (const arrow of dim.arrows) out.push(`<polygon points="${points(arrow)}" fill="${palette.muted}"/>`);
  }
  for (const edge of scene.edges) {
    out.push(
      `<line x1="${n(edge.a.x)}" y1="${n(edge.a.y)}" x2="${n(edge.b.x)}" y2="${n(edge.b.y)}" stroke="${palette.ink}" stroke-width="2.5" stroke-linecap="round"/>`
    );
  }
  for (const point of scene.points)
    out.push(`<circle cx="${n(point.at.x)}" cy="${n(point.at.y)}" r="3" fill="${palette.ink}"/>`);
  for (const marker of scene.markers) {
    out.push(
      `<circle cx="${n(marker.at.x)}" cy="${n(marker.at.y)}" r="6" fill="${palette.accent}" stroke="${palette.paper}" stroke-width="2"/>`
    );
  }
  for (const note of scene.notes) {
    note.text.split("\n").forEach((line, i) => {
      const y = note.rect.y + 5 + NOTE_FONT * (i + 1) * 1.1;
      out.push(
        `<text x="${n(note.rect.x + 6)}" y="${n(y)}" font-family="${SANS}" font-size="${NOTE_FONT}" fill="${palette.ink}">${escape(line)}</text>`
      );
    });
  }
  for (const label of scene.labels) {
    const { x, y, w, h } = label.rect;
    out.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="4" fill="${palette.chip}"/>`,
      `<text x="${n(x + w / 2)}" y="${n(y + h / 2)}" dominant-baseline="central" text-anchor="middle" font-family="${MONO}" font-size="${LABEL_FONT}" fill="${label.measured ? palette.ink : palette.accent}">${escape(label.text)}</text>`
    );
  }
  out.push("</svg>");
  return `${out.join("\n")}\n`;
}

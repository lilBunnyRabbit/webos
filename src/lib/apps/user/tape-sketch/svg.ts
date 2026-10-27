import { fit_view, type View } from "$kit/utils/view";
import type { Rect } from "./labels";
import type { Point, Sketch } from "./model";
import {
  build_scene,
  LABEL_FONT,
  NOTE_FONT,
  sketch_bounds,
  type SceneDim,
  type SceneLabel,
  type SceneMarker,
} from "./scene";

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
const line = (a: Point, b: Point, attributes: string) =>
  `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" ${attributes}/>`;

function fitted(bounds: Rect): View {
  const view = fit_view(Math.max(bounds.w, 1), Math.max(bounds.h, 1), EXPORT_SIDE, EXPORT_SIDE, 0);
  return { ...view, offset_x: -bounds.x * view.scale, offset_y: -bounds.y * view.scale };
}

function framed(area: Rect): Rect {
  return { x: area.x - MARGIN, y: area.y - MARGIN, w: area.w + MARGIN * 2, h: area.h + MARGIN * 2 };
}

function open_svg(box: Rect, palette: Palette): string[] {
  const width = Math.ceil(box.w);
  const height = Math.ceil(box.h);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${n(box.x)} ${n(box.y)} ${width} ${height}">`,
    `<rect x="${n(box.x)}" y="${n(box.y)}" width="${width}" height="${height}" fill="${palette.paper}"/>`,
  ];
}

function dims_svg(dims: SceneDim[], palette: Palette): string[] {
  return dims.flatMap((dim) => [
    ...[{ a: dim.a, b: dim.b }, ...dim.extensions].map((each) =>
      line(each.a, each.b, `stroke="${palette.muted}" stroke-width="1.25"`)
    ),
    ...dim.arrows.map((arrow) => `<polygon points="${points(arrow)}" fill="${palette.muted}"/>`),
  ]);
}

function markers_svg(markers: SceneMarker[], palette: Palette): string[] {
  return markers.map(
    (marker) =>
      `<circle cx="${n(marker.at.x)}" cy="${n(marker.at.y)}" r="6" fill="${palette.accent}" stroke="${palette.paper}" stroke-width="2"/>`
  );
}

function labels_svg(labels: SceneLabel[], palette: Palette): string[] {
  return labels.flatMap((label) => {
    const { x, y, w, h } = label.rect;
    return [
      `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="4" fill="${palette.chip}"/>`,
      `<text x="${n(x + w / 2)}" y="${n(y + h / 2)}" dominant-baseline="central" text-anchor="middle" font-family="${MONO}" font-size="${LABEL_FONT}" fill="${label.measured ? palette.ink : palette.accent}">${escape(label.text)}</text>`,
    ];
  });
}

export function export_scene(sketch: Sketch): { svg: (palette: Palette) => string } | null {
  const bounds = sketch_bounds(sketch);
  if (!bounds) return null;
  const scene = build_scene(sketch, fitted(bounds));
  const box = framed(scene.bounds!);
  return {
    svg: (palette) => {
      const out = open_svg(box, palette);
      out.push(...dims_svg(scene.dims, palette));
      for (const edge of scene.edges)
        out.push(line(edge.a, edge.b, `stroke="${palette.ink}" stroke-width="2.5" stroke-linecap="round"`));
      for (const point of scene.points)
        out.push(`<circle cx="${n(point.at.x)}" cy="${n(point.at.y)}" r="3" fill="${palette.ink}"/>`);
      out.push(...markers_svg(scene.markers, palette));
      for (const note of scene.notes) {
        note.text.split("\n").forEach((text, i) => {
          const y = note.rect.y + 5 + NOTE_FONT * (i + 1) * 1.1;
          out.push(
            `<text x="${n(note.rect.x + 6)}" y="${n(y)}" font-family="${SANS}" font-size="${NOTE_FONT}" fill="${palette.ink}">${escape(text)}</text>`
          );
        });
      }
      out.push(...labels_svg(scene.labels, palette), "</svg>");
      return `${out.join("\n")}\n`;
    },
  };
}


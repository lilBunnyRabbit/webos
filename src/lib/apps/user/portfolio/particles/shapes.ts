import LOGO_SOURCE from "$lib/core/components/brand/logo-mark.svelte?raw";
import { contain, sample_size, svg_paths, ToneRule, type Mask, type Rect } from "./targets";

export const ShapeKind = {
  LOGO: "logo",
  DOCUMENT: "document",
  LAYERS: "layers",
  FEATHER: "feather",
  CHECK: "check",
  BOLT: "bolt",
  WAVE: "wave",
} as const;
export type ShapeKind = (typeof ShapeKind)[keyof typeof ShapeKind];

export interface Shape {
  kind: ShapeKind;
}

export interface Drawn {
  mask: Mask;
  rule: ToneRule;
  seed: number;
}

const LOGO = svg_paths(LOGO_SOURCE);

export const shape_key = (shape: Shape) => shape.kind;

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function draw_shape(shape: Shape, aspect: number): Drawn {
  const { width, height } = sample_size(aspect);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const bounds: Rect = { x: 0, y: 0, width, height };
  let rule: ToneRule = ToneRule.DIAGONAL;

  if (context) {
    context.lineJoin = "round";
    context.lineCap = "round";
    switch (shape.kind) {
      case ShapeKind.LOGO: {
        const fit = contain(LOGO.width, LOGO.height, bounds, 0.08);
        context.translate(fit.x, fit.y);
        context.scale(fit.width / LOGO.width, fit.height / LOGO.height);
        for (const path of LOGO.paths) context.fill(new Path2D(path));
        break;
      }
      case ShapeKind.DOCUMENT: {
        const fit = contain(3, 4, bounds, 0.1);
        const { x, y, width: w, height: h } = fit;
        const fold = w * 0.3;
        context.lineWidth = w * 0.07;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + w - fold, y);
        context.lineTo(x + w, y + fold);
        context.lineTo(x + w, y + h);
        context.lineTo(x, y + h);
        context.closePath();
        context.moveTo(x + w - fold, y);
        context.lineTo(x + w - fold, y + fold);
        context.lineTo(x + w, y + fold);
        context.stroke();
        [0.62, 0.78, 0.62, 0.7].forEach((length, i) => {
          context.beginPath();
          context.roundRect(x + w * 0.2, y + h * (0.38 + i * 0.14), w * length * 0.86, w * 0.07, w * 0.035);
          context.fill();
        });
        rule = ToneRule.ROWS;
        break;
      }
      case ShapeKind.LAYERS: {
        const fit = contain(5, 4, bounds, 0.1);
        const { x, y, width: w, height: h } = fit;
        const depth = h * 0.24;
        const step = h * 0.2;
        context.lineWidth = w * 0.05;
        context.beginPath();
        context.moveTo(x + w / 2, y);
        context.lineTo(x + w, y + depth);
        context.lineTo(x + w / 2, y + depth * 2);
        context.lineTo(x, y + depth);
        context.closePath();
        context.fill();
        for (const offset of [step, step * 2]) {
          context.beginPath();
          context.moveTo(x + w * 0.04, y + depth + offset);
          context.lineTo(x + w / 2, y + depth * 2 + offset);
          context.lineTo(x + w * 0.96, y + depth + offset);
          context.stroke();
        }
        rule = ToneRule.ROWS;
        break;
      }
      case ShapeKind.FEATHER: {
        const fit = contain(1, 1, bounds, 0.08);
        const size = fit.width;
        context.translate(fit.x + size / 2, fit.y + size / 2);
        context.rotate(Math.PI / 4);
        context.scale(size, size);
        context.beginPath();
        context.moveTo(0, 0.3);
        context.quadraticCurveTo(0.26, 0.02, 0.02, -0.5);
        context.quadraticCurveTo(-0.22, -0.02, 0, 0.3);
        context.fill();
        context.globalCompositeOperation = "destination-out";
        context.lineWidth = 0.025;
        context.beginPath();
        context.moveTo(0, 0.3);
        context.lineTo(0.015, -0.42);
        for (const [from, to] of [
          [0.05, -0.08],
          [-0.12, -0.24],
        ]) {
          context.moveTo(0.004, from);
          context.lineTo(from > 0 ? 0.2 : -0.18, to);
        }
        context.stroke();
        context.globalCompositeOperation = "source-over";
        context.lineWidth = 0.035;
        context.beginPath();
        context.moveTo(0, 0.28);
        context.lineTo(0, 0.48);
        context.stroke();
        break;
      }
      case ShapeKind.CHECK: {
        const fit = contain(1, 1, bounds, 0.08);
        const { x, y, width: size } = fit;
        context.lineWidth = size * 0.07;
        context.beginPath();
        context.arc(x + size / 2, y + size / 2, size / 2 - context.lineWidth / 2, 0, Math.PI * 2);
        context.stroke();
        context.lineWidth = size * 0.1;
        context.beginPath();
        context.moveTo(x + size * 0.28, y + size * 0.52);
        context.lineTo(x + size * 0.44, y + size * 0.68);
        context.lineTo(x + size * 0.73, y + size * 0.36);
        context.stroke();
        rule = ToneRule.ANGLE;
        break;
      }
      case ShapeKind.BOLT: {
        const fit = contain(3, 4, bounds, 0.08);
        const points = [
          [0.62, 0],
          [0.06, 0.58],
          [0.46, 0.58],
          [0.34, 1],
          [0.94, 0.4],
          [0.54, 0.4],
          [0.72, 0],
        ];
        context.beginPath();
        points.forEach(([px, py], i) => {
          const at: [number, number] = [fit.x + px * fit.width, fit.y + py * fit.height];
          if (i === 0) context.moveTo(...at);
          else context.lineTo(...at);
        });
        context.closePath();
        context.fill();
        break;
      }
      case ShapeKind.WAVE: {
        const fit = contain(5, 2.4, bounds, 0.1);
        const amplitude = fit.height * 0.3;
        context.lineWidth = fit.height * 0.16;
        context.beginPath();
        for (let i = 0; i <= 120; i++) {
          const t = i / 120;
          const px = fit.x + fit.width * 0.04 + t * fit.width * 0.92;
          const py = fit.y + fit.height / 2 - Math.sin(t * Math.PI * 3) * amplitude;
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.stroke();
        break;
      }
    }
  }

  const pixels = context?.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  if (pixels) for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
  return { mask: { width, height, alpha }, rule, seed: hash(shape_key(shape)) };
}

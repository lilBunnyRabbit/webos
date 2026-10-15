import type { Rect } from "./model";

interface ColorRect extends Rect {
  color: number;
}

export function color_rects(rgba: Uint8ClampedArray, width: number, height: number): Map<number, Rect[]> {
  const words = new Uint32Array(rgba.buffer, rgba.byteOffset, width * height);
  const done: ColorRect[] = [];
  let open = new Map<string, ColorRect>();

  for (let y = 0; y < height; y++) {
    const next = new Map<string, ColorRect>();
    for (let x = 0; x < width; ) {
      const color = words[y * width + x];
      let end = x + 1;
      while (end < width && words[y * width + end] === color) end++;
      if (rgba[(y * width + x) * 4 + 3] > 0) {
        const key = `${x}:${end - x}:${color}`;
        const above = open.get(key);
        if (above) {
          above.height++;
          open.delete(key);
          next.set(key, above);
        } else {
          next.set(key, { x, y, width: end - x, height: 1, color });
        }
      }
      x = end;
    }
    for (const rect of open.values()) done.push(rect);
    open = next;
  }
  for (const rect of open.values()) done.push(rect);

  const by_color = new Map<number, Rect[]>();
  for (const { color, ...rect } of done) {
    const list = by_color.get(color);
    if (list) list.push(rect);
    else by_color.set(color, [rect]);
  }
  return by_color;
}

function hex2(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function fill_attributes(color: number): string {
  const bytes = new Uint8Array(new Uint32Array([color]).buffer);
  const fill = `#${hex2(bytes[0])}${hex2(bytes[1])}${hex2(bytes[2])}`;
  return bytes[3] === 255 ? `fill="${fill}"` : `fill="${fill}" fill-opacity="${(bytes[3] / 255).toFixed(3)}"`;
}

export function frame_body(rgba: Uint8ClampedArray, width: number, height: number): string {
  const parts: string[] = [];
  for (const [color, rects] of color_rects(rgba, width, height)) {
    const d = rects.map((r) => `M${r.x} ${r.y}h${r.width}v${r.height}h${-r.width}z`).join("");
    parts.push(`<path ${fill_attributes(color)} d="${d}"/>`);
  }
  return parts.join("");
}

function open_svg(width: number, height: number, scale: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" ` +
    `viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`
  );
}

export function static_svg(rgba: Uint8ClampedArray, width: number, height: number, scale = 1): string {
  return `${open_svg(width, height, scale)}${frame_body(rgba, width, height)}</svg>\n`;
}

export function dedupe_frames(frames: readonly Uint8ClampedArray[]): number[] {
  const seen = new Map<number, number[]>();
  return frames.map((frame, index) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < frame.length; i++) hash = Math.imul(hash ^ frame[i], 16777619);
    const candidates = seen.get(hash) ?? [];
    for (const candidate of candidates) {
      const other = frames[candidate];
      let same = other.length === frame.length;
      for (let i = 0; same && i < frame.length; i++) same = other[i] === frame[i];
      if (same) return candidate;
    }
    seen.set(hash, [...candidates, index]);
    return index;
  });
}

export interface AnimationStep {
  frame: number;
  duration: number;
}

export interface AnimatedSvgOptions {
  width: number;
  height: number;
  scale: number;
  bodies: readonly string[];
  steps: readonly AnimationStep[];
  loop: boolean;
}

function fraction(value: number): string {
  return Number(value.toFixed(6)).toString();
}

// SMIL, not script or CSS: it is what still plays when the SVG is shown through `<img>`.
export function animated_svg({ width, height, scale, bodies, steps, loop }: AnimatedSvgOptions): string {
  const total = steps.reduce((sum, step) => sum + step.duration, 0) || 1;
  const starts: number[] = [];
  let time = 0;
  for (const step of steps) {
    starts.push(time / total);
    time += step.duration;
  }

  const symbols = bodies.map((body, i) => `<symbol id="f${i}" overflow="visible">${body}</symbol>`).join("");
  const repeat = loop ? `repeatCount="indefinite"` : `repeatCount="1" fill="freeze"`;
  const groups = bodies
    .map((_, i) => {
      const values: string[] = [];
      const times: string[] = [];
      steps.forEach((step, s) => {
        const value = step.frame === i ? "visible" : "hidden";
        if (values[values.length - 1] === value) return;
        values.push(value);
        times.push(fraction(starts[s]));
      });
      if (!values.includes("visible")) return "";
      const initial = values[0];
      if (values.length === 1) return `<g visibility="${initial}"><use href="#f${i}"/></g>`;
      return (
        `<g visibility="${initial}"><use href="#f${i}"/>` +
        `<animate attributeName="visibility" calcMode="discrete" values="${values.join(";")}" ` +
        `keyTimes="${times.join(";")}" dur="${total}ms" ${repeat}/></g>`
      );
    })
    .join("");

  return `${open_svg(width, height, scale)}<defs>${symbols}</defs>${groups}</svg>\n`;
}

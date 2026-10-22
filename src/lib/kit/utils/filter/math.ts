export const FilterKind = {
  BRIGHTNESS: "brightness",
  CONTRAST: "contrast",
  SATURATE: "saturate",
  HUE_ROTATE: "hue-rotate",
  GRAYSCALE: "grayscale",
  SEPIA: "sepia",
  INVERT: "invert",
  BLUR: "blur",
} as const;
export type FilterKind = (typeof FilterKind)[keyof typeof FilterKind];

type PercentKind = Exclude<FilterKind, "hue-rotate" | "blur">;

/** One CSS filter function: percent amounts as in CSS (100 = unchanged), hue in degrees, blur as a radius in pixels. */
export type FilterStep =
  | { kind: PercentKind; percent: number }
  | { kind: typeof FilterKind.HUE_ROTATE; degrees: number }
  | { kind: typeof FilterKind.BLUR; radius: number };

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function filter_css(steps: readonly FilterStep[]): string {
  if (steps.length === 0) return "none";
  return steps
    .map((step) => {
      if (step.kind === FilterKind.HUE_ROTATE) return `hue-rotate(${step.degrees}deg)`;
      if (step.kind === FilterKind.BLUR) return `blur(${step.radius}px)`;
      return `${step.kind}(${step.percent}%)`;
    })
    .join(" ");
}

interface ColorTransform {
  matrix: number[];
  offset: number;
}

const clamp_unit = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

// The matrices are the Filter Effects spec's SVG equivalents of each shorthand function.
export function color_transform(step: Exclude<FilterStep, { kind: "blur" }>): ColorTransform {
  if (step.kind === FilterKind.HUE_ROTATE) {
    const angle = (step.degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      matrix: [
        0.213 + cos * 0.787 - sin * 0.213,
        0.715 - cos * 0.715 - sin * 0.715,
        0.072 - cos * 0.072 + sin * 0.928,
        0.213 - cos * 0.213 + sin * 0.143,
        0.715 + cos * 0.285 + sin * 0.14,
        0.072 - cos * 0.072 - sin * 0.283,
        0.213 - cos * 0.213 - sin * 0.787,
        0.715 - cos * 0.715 + sin * 0.715,
        0.072 + cos * 0.928 + sin * 0.072,
      ],
      offset: 0,
    };
  }
  const amount = step.percent / 100;
  switch (step.kind) {
    case FilterKind.BRIGHTNESS:
      return { matrix: [amount, 0, 0, 0, amount, 0, 0, 0, amount], offset: 0 };
    case FilterKind.CONTRAST:
      return { matrix: [amount, 0, 0, 0, amount, 0, 0, 0, amount], offset: 0.5 - 0.5 * amount };
    case FilterKind.INVERT: {
      const a = Math.min(1, amount);
      const slope = 1 - 2 * a;
      return { matrix: [slope, 0, 0, 0, slope, 0, 0, 0, slope], offset: a };
    }
    case FilterKind.SATURATE:
      return {
        matrix: [
          0.213 + 0.787 * amount,
          0.715 - 0.715 * amount,
          0.072 - 0.072 * amount,
          0.213 - 0.213 * amount,
          0.715 + 0.285 * amount,
          0.072 - 0.072 * amount,
          0.213 - 0.213 * amount,
          0.715 - 0.715 * amount,
          0.072 + 0.928 * amount,
        ],
        offset: 0,
      };
    case FilterKind.GRAYSCALE: {
      const rest = 1 - Math.min(1, amount);
      return {
        matrix: [
          0.2126 + 0.7874 * rest,
          0.7152 - 0.7152 * rest,
          0.0722 - 0.0722 * rest,
          0.2126 - 0.2126 * rest,
          0.7152 + 0.2848 * rest,
          0.0722 - 0.0722 * rest,
          0.2126 - 0.2126 * rest,
          0.7152 - 0.7152 * rest,
          0.0722 + 0.9278 * rest,
        ],
        offset: 0,
      };
    }
    case FilterKind.SEPIA: {
      const rest = 1 - Math.min(1, amount);
      return {
        matrix: [
          0.393 + 0.607 * rest,
          0.769 - 0.769 * rest,
          0.189 - 0.189 * rest,
          0.349 - 0.349 * rest,
          0.686 + 0.314 * rest,
          0.168 - 0.168 * rest,
          0.272 - 0.272 * rest,
          0.534 - 0.534 * rest,
          0.131 + 0.869 * rest,
        ],
        offset: 0,
      };
    }
  }
}

// Clamped after every step, as each function in a CSS filter chain is its own filter primitive.
function apply_colors(pixels: Pixels, transforms: readonly ColorTransform[]): void {
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;
    for (const { matrix: m, offset } of transforms) {
      const nr = clamp_unit(m[0] * r + m[1] * g + m[2] * b + offset);
      const ng = clamp_unit(m[3] * r + m[4] * g + m[5] * b + offset);
      const nb = clamp_unit(m[6] * r + m[7] * g + m[8] * b + offset);
      r = nr;
      g = ng;
      b = nb;
    }
    data[i] = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
  }
}

export interface Box {
  before: number;
  after: number;
}

/**
 * The Filter Effects spec's three boxes for a Gaussian of deviation `sigma`, the approximation browsers use too. An even
 * width can't centre on a pixel, so its two boxes lean left and right and the third is one wider.
 */
export function gauss_boxes(sigma: number): Box[] {
  const width = Math.floor((sigma * 3 * Math.sqrt(2 * Math.PI)) / 4 + 0.5);
  if (width <= 1) return [];
  const half = Math.floor(width / 2);
  if (width % 2 === 1) return Array.from({ length: 3 }, () => ({ before: half, after: half }));
  return [
    { before: half, after: half - 1 },
    { before: half - 1, after: half },
    { before: half, after: half },
  ];
}

// One pass along rows (pixel step 4) or columns (pixel step 4 × width); outside the buffer counts as transparent.
function box_pass(from: Float32Array, to: Float32Array, lines: number, length: number, line_step: number, pixel_step: number, box: Box): void {
  const window = box.before + box.after + 1;
  for (let line = 0; line < lines; line++) {
    const base = line * line_step;
    for (let channel = 0; channel < 4; channel++) {
      let sum = 0;
      for (let i = 0; i <= Math.min(box.after, length - 1); i++) sum += from[base + i * pixel_step + channel];
      for (let i = 0; i < length; i++) {
        to[base + i * pixel_step + channel] = sum / window;
        const enter = i + box.after + 1;
        const leave = i - box.before;
        if (enter < length) sum += from[base + enter * pixel_step + channel];
        if (leave >= 0) sum -= from[base + leave * pixel_step + channel];
      }
    }
  }
}

/** Gaussian blur of deviation `radius` (the CSS `blur()` length), done in premultiplied alpha like the browser's. */
export function blur_pixels(pixels: Pixels, radius: number): void {
  const boxes = gauss_boxes(radius);
  if (boxes.length === 0) return;
  const { data, width, height } = pixels;
  // Passes stack, so what one spreads past the edge has to stay around for the next: work on a padded copy.
  const pad = boxes.reduce((sum, box) => sum + Math.max(box.before, box.after), 0);
  const wide = width + pad * 2;
  const tall = height + pad * 2;
  const a = new Float32Array(wide * tall * 4);
  const b = new Float32Array(a.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = ((y + pad) * wide + x + pad) * 4;
      const alpha = data[from + 3] / 255;
      a[to] = data[from] * alpha;
      a[to + 1] = data[from + 1] * alpha;
      a[to + 2] = data[from + 2] * alpha;
      a[to + 3] = data[from + 3];
    }
  }
  for (const box of boxes) {
    box_pass(a, b, tall, wide, wide * 4, 4, box);
    box_pass(b, a, wide, tall, 4, wide * 4, box);
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const to = (y * width + x) * 4;
      const from = ((y + pad) * wide + x + pad) * 4;
      const alpha = a[from + 3];
      data[to + 3] = Math.round(alpha);
      if (alpha < 0.5) {
        data[to] = data[to + 1] = data[to + 2] = 0;
        continue;
      }
      const scale = 255 / alpha;
      data[to] = Math.round(a[from] * scale);
      data[to + 1] = Math.round(a[from + 1] * scale);
      data[to + 2] = Math.round(a[from + 2] * scale);
    }
  }
}

export function apply_filter_steps(pixels: Pixels, steps: readonly FilterStep[]): void {
  let colors: ColorTransform[] = [];
  const flush = () => {
    if (colors.length) apply_colors(pixels, colors);
    colors = [];
  };
  for (const step of steps) {
    if (step.kind === FilterKind.BLUR) {
      flush();
      blur_pixels(pixels, step.radius);
    } else {
      colors.push(color_transform(step));
    }
  }
  flush();
}

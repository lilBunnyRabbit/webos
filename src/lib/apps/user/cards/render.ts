import {
  azteccode,
  code128,
  code39,
  code93,
  datamatrix,
  ean13,
  ean8,
  interleaved2of5,
  pdf417,
  qrcode,
  rationalizedCodabar,
  upca,
  upce,
  type DrawingContext,
  type RenderOptions,
} from "bwip-js/browser";
import { CardFormat, encoder_text, FORMATS } from "./formats";

type Encoder = (options: RenderOptions, drawing: DrawingContext<BarcodePath>) => BarcodePath;

// Named imports, not bwip-js's `toSVG(bcid)`, so the build keeps only these encoders.
export const ENCODERS: Record<string, Encoder> = {
  ean13,
  ean8,
  upca,
  upce,
  code128,
  code39,
  code93,
  interleaved2of5,
  rationalizedCodabar,
  qrcode,
  pdf417,
  azteccode,
  datamatrix,
};

export interface BarcodePath {
  width: number;
  height: number;
  d: string;
  // Wider than width × height: scanners need a quiet zone around the code.
  view_box: string;
}

const LINEAR_HEIGHT_MM = 18;
const SCALE = 2;
// In modules: EAN asks for 11 on the left and 7 on the right, QR for 4 all round; the larger fits every format here.
const QUIET = { linear: 11, square: 4, stacked: 2, none: 0 } as const;

// One path instead of bwip-js's SVG string, so the page colours it with theme tokens.
function path_drawing(): DrawingContext<BarcodePath> {
  let width = 0;
  let height = 0;
  let d = "";
  return {
    scale: () => null,
    measure: () => ({ width: 0, ascent: 0, descent: 0 }),
    init(w, h) {
      width = w;
      height = h;
    },
    // Same pixel coverage as bwip-js's own bitmap drawing: the wider half of an odd width sits before the line.
    line(x0, y0, x1, y1, lw) {
      const width = Math.round(lw) || 1;
      const half = Math.floor(width / 2);
      const [left, right] = [Math.min(x0, x1) | 0, Math.max(x0, x1) | 0];
      const [top, bottom] = [Math.min(y0, y1) | 0, Math.max(y0, y1) | 0];
      if (left === right) d += `M${left - width + half} ${top}h${width}v${bottom - top + 1}h${-width}z`;
      else d += `M${left} ${top - half}h${right - left + 1}v${width}h${left - right - 1}z`;
    },
    polygon(points) {
      d += `M${points.map(([x, y]) => `${x} ${y}`).join("L")}Z`;
    },
    hexagon() {},
    ellipse() {},
    fill() {},
    text() {},
    end: () => ({ width, height, d, view_box: `0 0 ${width} ${height}` }),
  };
}

export function barcode_path(format: CardFormat, code: string): BarcodePath {
  const { bcid, shape } = FORMATS[format];
  const encode = bcid ? ENCODERS[bcid] : undefined;
  if (!encode) throw new Error(`${FORMATS[format].label} has no barcode`);
  const options: RenderOptions = { bcid: bcid!, text: encoder_text(format, code), scale: SCALE, includetext: false };
  if (shape === "linear") options.height = LINEAR_HEIGHT_MM;
  // Code 93's two check characters are mandatory, but BWIPP leaves them to the caller.
  if (format === CardFormat.CODE_93) options.includecheck = true;
  const path = encode(options, path_drawing());
  const x = QUIET[shape] * SCALE;
  const y = shape === "linear" ? 0 : x;
  return { ...path, view_box: `${-x} ${-y} ${path.width + 2 * x} ${path.height + 2 * y}` };
}

export function render_error(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^bwip(?:p|-js)[^:]*:\s*/, "") || "This code can't be drawn";
}

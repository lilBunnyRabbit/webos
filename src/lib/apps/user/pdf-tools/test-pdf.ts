import { z } from "zod";

export const Paper = { A4: "a4", LETTER: "letter", A5: "a5", A3: "a3", LEGAL: "legal", CUSTOM: "custom", MIXED: "mixed" } as const;
export type Paper = (typeof Paper)[keyof typeof Paper];
export const PAPERS = Object.values(Paper) as [Paper, ...Paper[]];

export const Orientation = { PORTRAIT: "portrait", LANDSCAPE: "landscape", MIXED: "mixed" } as const;
export type Orientation = (typeof Orientation)[keyof typeof Orientation];
export const ORIENTATIONS = Object.values(Orientation) as [Orientation, ...Orientation[]];

const PAPER_MM: Record<Exclude<Paper, "custom" | "mixed">, { name: string; width: number; height: number }> = {
  a4: { name: "A4", width: 210, height: 297 },
  letter: { name: "Letter", width: 215.9, height: 279.4 },
  a5: { name: "A5", width: 148, height: 210 },
  a3: { name: "A3", width: 297, height: 420 },
  legal: { name: "Legal", width: 215.9, height: 355.6 },
};
const MIXED_CYCLE = [Paper.A4, Paper.LETTER, Paper.A5, Paper.A3, Paper.LEGAL] as const;

export const MAX_PAGES = 50_000;
/** Cross-reference offsets are 10 digits. */
export const MAX_PDF_BYTES = 9_999_999_999;
const MM = 72 / 25.4;

export const test_pdf_schema = z.object({
  pages: z.number().int().min(1).max(MAX_PAGES),
  paper: z.enum(PAPERS),
  custom_width: z.number().min(10).max(5000),
  custom_height: z.number().min(10).max(5000),
  orientation: z.enum(ORIENTATIONS),
  number: z.boolean(),
  label: z.string().max(200),
  margin: z.number().min(0).max(100),
  rulers: z.boolean(),
  grid: z.number().min(0).max(500),
  crosshair: z.boolean(),
  corners: z.boolean(),
  tint: z.boolean(),
  text: z.number().int().min(0).max(50),
  images: z.number().int().min(0).max(16),
  image_size: z.number().int().min(8).max(4096),
});
export type TestPdfOptions = z.infer<typeof test_pdf_schema>;

export const DEFAULT_PDF: TestPdfOptions = {
  pages: 10,
  paper: Paper.A4,
  custom_width: 100,
  custom_height: 150,
  orientation: Orientation.PORTRAIT,
  number: true,
  label: "Page {page} of {pages} · {paper} · {size}",
  margin: 15,
  rulers: true,
  grid: 0,
  crosshair: true,
  corners: true,
  tint: true,
  text: 0,
  images: 0,
  image_size: 256,
};

export interface PageSize {
  name: string;
  orientation: "portrait" | "landscape";
  width: number;
  height: number;
}

export function page_size(options: TestPdfOptions, index: number): PageSize {
  const paper = options.paper === Paper.MIXED ? MIXED_CYCLE[index % MIXED_CYCLE.length] : options.paper;
  const flip = options.orientation === Orientation.MIXED ? index % 2 === 1 : options.orientation === Orientation.LANDSCAPE;
  // A custom size is taken as typed and landscape swaps it; a paper size is portrait with its short side across.
  const [width, height] =
    paper === Paper.CUSTOM
      ? [options.custom_width, options.custom_height]
      : [Math.min(PAPER_MM[paper].width, PAPER_MM[paper].height), Math.max(PAPER_MM[paper].width, PAPER_MM[paper].height)];
  const [w, h] = flip ? [height, width] : [width, height];
  return { name: paper === Paper.CUSTOM ? "Custom" : PAPER_MM[paper].name, orientation: w > h ? "landscape" : "portrait", width: w, height: h };
}

export function parse_page(text: string): Pick<TestPdfOptions, "paper" | "custom_width" | "custom_height"> | null {
  const lower = text.trim().toLowerCase();
  const named = PAPERS.find((paper) => paper === lower && paper !== Paper.CUSTOM);
  if (named) return { paper: named, custom_width: DEFAULT_PDF.custom_width, custom_height: DEFAULT_PDF.custom_height };
  const match = /^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*mm)?$/.exec(lower);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 10 || height < 10 || width > 5000 || height > 5000) return null;
  return { paper: Paper.CUSTOM, custom_width: width, custom_height: height };
}


// Helvetica advance widths (AFM, per 1000 em) for WinAnsi 32–126; the digits are the same in Helvetica-Bold.
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];
const LATIN_WIDTHS: Record<number, number> = { 0xb7: 278, 0xd7: 584 };

export function pdf_text(text: string): string {
  return text.replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

export function text_width(text: string, size: number): number {
  let width = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    width += code >= 32 && code <= 126 ? WIDTHS[code - 32] : (LATIN_WIDTHS[code] ?? 556);
  }
  return (width * size) / 1000;
}

const escape = (text: string) => pdf_text(text).replace(/[\\()]/g, (char) => `\\${char}`);

export function wrap(text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && text_width(next, size) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const FILLER =
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. Sphinx of black quartz, judge my vow. How vexingly quick daft zebras jump! This paragraph is filler for testing text selection, search, copy and extraction; every page carries its own number in the text so a match can be traced back.";

const fmt = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
};

export function label_text(template: string, page: number, pages: number, size: PageSize): string {
  return template
    .replaceAll("{page}", String(page))
    .replaceAll("{pages}", String(pages))
    .replaceAll("{paper}", `${size.name} ${size.orientation}`)
    .replaceAll("{size}", `${fmt(size.width)} × ${fmt(size.height)} mm`);
}


function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

const page_hue = (index: number) => (index * 0.618_034) % 1;
const rgb_op = (rgb: [number, number, number], op: "rg" | "RG") => `${rgb.map((v) => fmt(v)).join(" ")} ${op}`;


const INK: [number, number, number] = [0.1, 0.1, 0.12];

function page_content(options: TestPdfOptions, index: number, size: PageSize, payload: number): string {
  const W = size.width * MM;
  const H = size.height * MM;
  const ops: string[] = [];
  const hue = page_hue(index);
  const margin = options.margin * MM;
  const inset = Math.max(margin, (options.rulers ? 12 : 8) * MM);

  if (options.tint) ops.push(rgb_op(hsl(hue, 0.6, 0.94), "rg"), `0 0 ${fmt(W)} ${fmt(H)} re f`);

  if (options.grid > 0) {
    const step = options.grid * MM;
    ops.push("0.25 w", rgb_op(hsl(hue, 0.25, 0.75), "RG"));
    for (let x = step; x < W - 0.01; x += step) ops.push(`${fmt(x)} 0 m ${fmt(x)} ${fmt(H)} l`);
    for (let y = step; y < H - 0.01; y += step) ops.push(`0 ${fmt(H - y)} m ${fmt(W)} ${fmt(H - y)} l`);
    ops.push("S");
  }

  if (margin > 0) ops.push("0.6 w [4 3] 0 d", rgb_op(hsl(hue, 0.6, 0.45), "RG"), `${fmt(margin)} ${fmt(margin)} ${fmt(W - 2 * margin)} ${fmt(H - 2 * margin)} re S`, "[] 0 d");

  ops.push(rgb_op(INK, "rg"), rgb_op(INK, "RG"));

  if (options.rulers) {
    // Each row of ticks is one dashed line as thick as the ticks are long: 12 strokes instead of a path per millimetre.
    const tick = 0.4;
    for (const [every, length] of [[1, 1.6 * MM], [5, 2.6 * MM], [10, 4 * MM]]) {
      const half = fmt(length / 2);
      ops.push(`${fmt(length)} w [${tick} ${fmt(every * MM - tick)}] 0 d`);
      ops.push(`${-tick / 2} ${fmt(H - length / 2)} m ${fmt(W)} ${fmt(H - length / 2)} l ${-tick / 2} ${half} m ${fmt(W)} ${half} l`);
      ops.push(`${half} ${fmt(H + tick / 2)} m ${half} 0 l ${fmt(W - length / 2)} ${fmt(H + tick / 2)} m ${fmt(W - length / 2)} 0 l S`);
    }
    ops.push("[] 0 d", "BT /F1 6 Tf");
    for (let mm = 10; mm < size.width; mm += 10) {
      const text = String(mm);
      ops.push(`1 0 0 1 ${fmt(mm * MM - text_width(text, 6) / 2)} ${fmt(H - 4 * MM - 6)} Tm (${text}) Tj`);
    }
    for (let mm = 10; mm < size.height; mm += 10) ops.push(`1 0 0 1 ${fmt(4.4 * MM)} ${fmt(H - mm * MM - 2)} Tm (${mm}) Tj`);
    ops.push("ET");
  }

  if (options.crosshair) ops.push("0.5 w", `${fmt(W / 2)} 0 m ${fmt(W / 2)} ${fmt(H)} l 0 ${fmt(H / 2)} m ${fmt(W)} ${fmt(H / 2)} l S`);

  if (options.corners) {
    const arm = 12 * MM;
    ops.push("1.5 w", `0.75 ${fmt(H - arm)} m 0.75 ${fmt(H - 0.75)} l ${fmt(arm)} ${fmt(H - 0.75)} l`);
    ops.push(`${fmt(W - arm)} ${fmt(H - 0.75)} m ${fmt(W - 0.75)} ${fmt(H - 0.75)} l ${fmt(W - 0.75)} ${fmt(H - arm)} l`);
    ops.push(`0.75 ${fmt(arm)} m 0.75 0.75 l ${fmt(arm)} 0.75 l`);
    ops.push(`${fmt(W - arm)} 0.75 m ${fmt(W - 0.75)} 0.75 l ${fmt(W - 0.75)} ${fmt(arm)} l S`);
    const w = fmt(size.width);
    const h = fmt(size.height);
    const corner = (text: string, right: boolean, top: boolean) => {
      const x = right ? W - inset - text_width(text, 7) : inset;
      const y = top ? H - inset + 2 : inset - 9;
      return `1 0 0 1 ${fmt(x)} ${fmt(y)} Tm (${text}) Tj`;
    };
    ops.push("BT /F1 7 Tf", corner("0,0 mm", false, true), corner(`${w},0`, true, true), corner(`0,${h}`, false, false), corner(`${w},${h}`, true, false), "ET");
  }

  let top = H - inset;
  const label = label_text(options.label, index + 1, options.pages, size).trim();
  if (label) {
    const size_pt = Math.min(14, ((W - 2 * inset) / Math.max(1, text_width(label, 1))) * 0.95);
    ops.push("BT", `/F1 ${fmt(size_pt)} Tf`, `1 0 0 1 ${fmt((W - text_width(label, size_pt)) / 2)} ${fmt(top - size_pt)} Tm`, `(${escape(label)}) Tj`, "ET");
    top -= size_pt + 10;
  }

  const digits = String(index + 1);
  const number_size = options.number ? Math.min(H * 0.28, ((W - 2 * inset) * 0.85) / (digits.length * 0.556)) : 0;
  const middle = H / 2;

  if (options.text > 0) {
    const size_pt = 10;
    const leading = 13;
    const floor = options.number ? middle + number_size * 0.45 : inset + 20;
    const lines = Array.from({ length: options.text }, (_, n) => `Page ${index + 1}, paragraph ${n + 1}. ${FILLER}`).flatMap((paragraph, n) =>
      n === 0 ? wrap(paragraph, size_pt, W - 2 * inset) : ["", ...wrap(paragraph, size_pt, W - 2 * inset)]
    );
    const room = Math.max(0, Math.floor((top - floor) / leading));
    if (room > 0) {
      ops.push("BT", `/F1 ${size_pt} Tf`, `${leading} TL`, `1 0 0 1 ${fmt(inset)} ${fmt(top - size_pt)} Tm`);
      for (const line of lines.slice(0, room)) ops.push(`(${escape(line)}) '`);
      ops.push("ET");
    }
  }

  if (options.number) {
    ops.push(rgb_op(hsl(hue, 0.65, 0.35), "rg"), "BT", `/F2 ${fmt(number_size)} Tf`, `1 0 0 1 ${fmt((W - text_width(digits, number_size)) / 2)} ${fmt(middle - number_size * 0.36)} Tm`, `(${digits}) Tj`, "ET");
    ops.push(rgb_op(INK, "rg"));
  }

  if (options.images > 0) {
    const ceiling = options.number ? middle - number_size * 0.45 : middle;
    const area = { x: inset, y: inset + 14, width: W - 2 * inset, height: Math.max(0, ceiling - inset - 24) };
    const columns = Math.ceil(Math.sqrt(options.images));
    const rows = Math.ceil(options.images / columns);
    const gap = 6;
    const side = Math.max(4, Math.min((area.width - gap * (columns - 1)) / columns, (area.height - gap * (rows - 1)) / rows));
    const left = area.x + (area.width - (side * columns + gap * (columns - 1))) / 2;
    for (let n = 0; n < options.images; n++) {
      const x = left + (n % columns) * (side + gap);
      const y = area.y + area.height - Math.floor(n / columns + 1) * side - Math.floor(n / columns) * gap;
      ops.push(`q ${fmt(side)} 0 0 ${fmt(side)} ${fmt(x)} ${fmt(y)} cm /Im${n + 1} Do Q`);
    }
  }

  if (payload > 0) {
    const note = `Embedded test data: ${payload} bytes (not drawn)`;
    ops.push("BT /F1 7 Tf", `1 0 0 1 ${fmt((W - text_width(note, 7)) / 2)} ${fmt(Math.max(4, inset - 9))} Tm`, `(${note}) Tj`, "ET");
  }

  return ops.join("\n");
}


export interface Binary {
  length: number;
  chunks(): Iterable<Uint8Array>;
}

export type Part = string | Binary;

const CHUNK = 1 << 20;

/** xorshift32: fast, seeded, and incompressible enough that zipping the PDF doesn't shrink it. */
function noise(length: number, seed: number): Binary {
  return {
    length,
    *chunks() {
      let state = seed >>> 0 || 0x9e3779b9;
      for (let done = 0; done < length; done += CHUNK) {
        const size = Math.min(CHUNK, length - done);
        const words = new Uint32Array(Math.ceil(size / 4));
        for (let index = 0; index < words.length; index++) {
          state ^= state << 13;
          state ^= state >>> 17;
          state ^= state << 5;
          words[index] = state;
        }
        yield new Uint8Array(words.buffer, 0, size);
      }
    },
  };
}

/** A raw RGB test image: checkerboard in the page's hue with a dark frame and a diagonal, so scaling and cropping show. */
function test_image(side: number, hue: number): Binary {
  const light = hsl(hue, 0.65, 0.6).map((v) => Math.round(v * 255));
  const dark = hsl(hue, 0.65, 0.3).map((v) => Math.round(v * 255));
  const cell = Math.max(1, Math.round(side / 8));
  const frame = Math.max(1, Math.round(side / 64));
  return {
    length: side * side * 3,
    *chunks() {
      const rows_per_chunk = Math.max(1, Math.floor(CHUNK / (side * 3)));
      for (let y0 = 0; y0 < side; y0 += rows_per_chunk) {
        const rows = Math.min(rows_per_chunk, side - y0);
        const out = new Uint8Array(rows * side * 3);
        for (let j = 0; j < rows; j++) {
          const y = y0 + j;
          for (let x = 0; x < side; x++) {
            const edge = x < frame || y < frame || x >= side - frame || y >= side - frame || Math.abs(x - y) < frame;
            const color = edge ? [20, 20, 24] : ((Math.floor(x / cell) + Math.floor(y / cell)) & 1) === 0 ? light : dark;
            out.set(color, (j * side + x) * 3);
          }
        }
        yield out;
      }
    },
  };
}


export interface PdfLayout {
  /** Bytes of random data per page, kept in the page's PieceInfo: present only when sizing to a target. */
  payload: number[] | null;
  /** Comment bytes before the cross-reference table, for the last few bytes of an exact size. */
  pad: number;
  date: string;
}

export function pdf_date(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `D:${date.getUTCFullYear()}${two(date.getUTCMonth() + 1)}${two(date.getUTCDate())}${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}Z`;
}

function comment_lines(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 2) throw new Error("Padding must be 0 or at least 2 bytes");
  const lines: number[] = [];
  let left = bytes;
  while (left > 0) {
    let take = Math.min(256, left);
    if (left - take === 1) take -= 1;
    lines.push(take);
    left -= take;
  }
  return lines.map((length) => `%${"0".repeat(length - 2)}\n`).join("");
}

/**
 * The whole PDF as parts, in file order: a hand-written serializer, because pdf-lib keeps the document in memory and
 * a multi-gigabyte file wouldn't fit. Objects are numbered up front, so the page tree can come first and the file is
 * written front to back. `on_page` runs before each page.
 */
export function* pdf_parts(options: TestPdfOptions, layout: PdfLayout, on_page?: (index: number) => void): Generator<Part> {
  const per_page = 2 + options.images + (layout.payload ? 1 : 0);
  const first_page = 6;
  const count = first_page + options.pages * per_page;
  const offsets = new Float64Array(count);
  let offset = 0;

  function* emit(part: Part): Generator<Part> {
    offset += typeof part === "string" ? part.length : part.length;
    yield part;
  }
  function* object(number: number, body: string): Generator<Part> {
    offsets[number] = offset;
    yield* emit(`${number} 0 obj\n${body}\nendobj\n`);
  }
  function* stream(number: number, dictionary: string, data: Part): Generator<Part> {
    offsets[number] = offset;
    const length = typeof data === "string" ? data.length : data.length;
    yield* emit(`${number} 0 obj\n<< ${dictionary}${dictionary ? " " : ""}/Length ${length} >>\nstream\n`);
    yield* emit(data);
    yield* emit("\nendstream\nendobj\n");
  }

  yield* emit("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n");
  yield* object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const kids: string[] = [];
  for (let index = 0; index < options.pages; index++) kids.push(`${first_page + index * per_page} 0 R`);
  yield* object(2, `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${options.pages} >>`);
  yield* object(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  yield* object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  yield* object(5, `<< /Title (Test PDF) /Producer (WebOS PDF Tools) /CreationDate (${layout.date}) >>`);

  for (let index = 0; index < options.pages; index++) {
    on_page?.(index);
    const base = first_page + index * per_page;
    const size = page_size(options, index);
    const payload = layout.payload?.[index] ?? 0;
    const images = Array.from({ length: options.images }, (_, n) => `/Im${n + 1} ${base + 2 + n} 0 R`).join(" ");
    const piece = layout.payload
      ? ` /PieceInfo << /WebOSTest << /LastModified (${layout.date}) /Private ${base + 2 + options.images} 0 R >> >>`
      : "";
    yield* object(
      base,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(size.width * MM)} ${fmt(size.height * MM)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${images ? ` /XObject << ${images} >>` : ""} >> /Contents ${base + 1} 0 R${piece} >>`
    );
    yield* stream(base + 1, "", page_content(options, index, size, payload));
    for (let n = 0; n < options.images; n++) {
      const side = options.image_size;
      yield* stream(
        base + 2 + n,
        `/Type /XObject /Subtype /Image /Width ${side} /Height ${side} /ColorSpace /DeviceRGB /BitsPerComponent 8`,
        test_image(side, (page_hue(index) + n * 0.17) % 1)
      );
    }
    if (layout.payload) yield* stream(base + 2 + options.images, "", noise(payload, index + 1));
  }

  yield* emit(comment_lines(layout.pad));
  const xref = offset;
  yield* emit(`xref\n0 ${count}\n0000000000 65535 f \n`);
  const ENTRIES = 50_000;
  for (let start = 1; start < count; start += ENTRIES) {
    let lines = "";
    for (let number = start; number < Math.min(count, start + ENTRIES); number++)
      lines += `${String(offsets[number]).padStart(10, "0")} 00000 n \n`;
    yield* emit(lines);
  }
  yield* emit(`trailer\n<< /Size ${count} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

export function pdf_size(options: TestPdfOptions, layout: PdfLayout): number {
  let size = 0;
  for (const part of pdf_parts(options, layout)) size += part.length;
  return size;
}

export type PdfPlan = { ok: true; layout: PdfLayout; bytes: number } | { ok: false; error: string };

export function plan_pdf(options: TestPdfOptions, target: number | null, date: string): PdfPlan {
  if (target === null) {
    const layout = { payload: null, pad: 0, date };
    return { ok: true, layout, bytes: pdf_size(options, layout) };
  }
  if (target > MAX_PDF_BYTES) return { ok: false, error: "A PDF here can be at most 9.9 GB: its offsets have 10 digits" };
  const empty = { payload: new Array<number>(options.pages).fill(0), pad: 0, date };
  const base = pdf_size(options, empty);
  if (target < base + 2) return { ok: false, error: `These pages already take ${base} bytes; ask for more, or fewer pages` };
  const share = Math.floor((target - base) / options.pages);
  const payload = new Array<number>(options.pages).fill(share);
  payload[options.pages - 1] += target - base - share * options.pages;
  for (let attempt = 0; attempt < 8; attempt++) {
    const gap = target - pdf_size(options, { payload, pad: 0, date });
    if (gap === 0 || gap >= 2) return { ok: true, layout: { payload, pad: gap, date }, bytes: target };
    const cut = 2 - gap;
    let index = options.pages - 1;
    while (index >= 0 && payload[index] < cut) index--;
    if (index < 0) break;
    payload[index] -= cut;
  }
  return { ok: false, error: "Couldn't land on that exact size; try a slightly different one" };
}

export function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) out[index] = text.charCodeAt(index);
  return out;
}

export function test_pdf_name(options: TestPdfOptions, target: number | null): string {
  const paper = options.paper === Paper.CUSTOM ? `${fmt(options.custom_width)}x${fmt(options.custom_height)}mm` : options.paper;
  return `test-${options.pages}p-${paper}${target === null ? "" : `-${target}b`}.pdf`;
}

/** The whole file in memory: for previews and tests, never for large documents. */
export function pdf_bytes(options: TestPdfOptions, layout: PdfLayout): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const part of pdf_parts(options, layout)) {
    if (typeof part === "string") chunks.push(latin1(part));
    else for (const chunk of part.chunks()) chunks.push(chunk.slice());
  }
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Exact up to 500 pages; past that, the first 500 scaled up. */
export function estimate_pdf_size(options: TestPdfOptions): { bytes: number; exact: boolean } {
  const layout = { payload: null, pad: 0, date: pdf_date(new Date(0)) };
  if (options.pages <= 500) return { bytes: pdf_size(options, layout), exact: true };
  const sample = pdf_size({ ...options, pages: 500 }, layout);
  return { bytes: Math.round((sample * options.pages) / 500), exact: false };
}

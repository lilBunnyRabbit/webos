import { PAPER } from "$lib/apps/user/pdf-tools/geometry";
import { PageSize } from "$lib/apps/user/pdf-tools/kinds";

export type PosterPaper = Exclude<PageSize, "image">;
export const POSTER_PAPERS = [PageSize.A4, PageSize.LETTER, PageSize.A3] as const;

export const MM_PER_PT = 25.4 / 72;
export const MAX_ACROSS = 20;
export const MAX_SHEETS = 400;
/** Tiles are scaled down past this: no printer shows more, and the PDF would only grow. */
export const MAX_DPI = 300;
export const LOW_DPI = 150;
export const POOR_DPI = 100;
export const MIN_MARGIN = 5;

export interface Size {
  width: number;
  height: number;
}

export interface Box extends Size {
  x: number;
  y: number;
}

export interface PosterSettings {
  paper: PosterPaper;
  landscape: boolean;
  across: number;
  /** Millimetres each sheet shares with its right and lower neighbour. */
  overlap: number;
  margin: number;
}

export interface PosterSheet {
  label: string;
  row: number;
  column: number;
  /** The sheet's printable area on the poster in millimetres; the last row can run past the image. */
  area: Box;
  printed: Size;
  source: Box;
  joins: { left: boolean; top: boolean; right: boolean; bottom: boolean };
}

export interface PosterLayout {
  sheet: Size;
  printable: Size;
  columns: number;
  rows: number;
  overlap: number;
  margin: number;
  poster: Size;
  grid: Size;
  dpi: number;
  sheets: PosterSheet[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function sheet_size(paper: PosterPaper, landscape: boolean): Size {
  const [short, long] = PAPER[paper].map((points) => points * MM_PER_PT);
  return landscape ? { width: long, height: short } : { width: short, height: long };
}

export function column_label(index: number): string {
  let label = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    label = String.fromCharCode(65 + ((rest - 1) % 26)) + label;
  }
  return label;
}

export function sheet_label(row: number, column: number): string {
  return `${column_label(column)}${row + 1}`;
}

export function poster_layout(image_width: number, image_height: number, settings: PosterSettings): PosterLayout {
  const sheet = sheet_size(settings.paper, settings.landscape);
  const margin = clamp(settings.margin, MIN_MARGIN, Math.min(sheet.width, sheet.height) / 4);
  const printable = { width: sheet.width - margin * 2, height: sheet.height - margin * 2 };
  const overlap = clamp(settings.overlap, 0, Math.min(printable.width, printable.height) / 2);
  const columns = clamp(Math.round(settings.across) || 1, 1, MAX_ACROSS);
  const step = { x: printable.width - overlap, y: printable.height - overlap };

  const poster_width = columns * step.x + overlap;
  const mm_per_px = poster_width / image_width;
  const poster = { width: poster_width, height: image_height * mm_per_px };
  // The epsilon keeps a float hair over a whole sheet from adding an empty row.
  const rows = Math.max(1, Math.ceil((poster.height - overlap) / step.y - 1e-9));

  const sheets: PosterSheet[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const area = { x: column * step.x, y: row * step.y, ...printable };
      const printed = {
        width: Math.max(0, Math.min(area.width, poster.width - area.x)),
        height: Math.max(0, Math.min(area.height, poster.height - area.y)),
      };
      sheets.push({
        label: sheet_label(row, column),
        row,
        column,
        area,
        printed,
        source: {
          x: area.x / mm_per_px,
          y: area.y / mm_per_px,
          width: printed.width / mm_per_px,
          height: printed.height / mm_per_px,
        },
        joins: { left: column > 0, top: row > 0, right: column < columns - 1, bottom: row < rows - 1 },
      });
    }
  }

  return {
    sheet,
    printable,
    columns,
    rows,
    overlap,
    margin,
    poster,
    grid: { width: poster.width, height: rows * step.y + overlap },
    dpi: image_width / (poster.width / 25.4),
    sheets,
  };
}

/** Each sheet's own piece once the overlaps are laid over: what the assembly map labels. */
export function sheet_cells(layout: PosterLayout): (Box & { label: string })[] {
  const { columns, rows, overlap, grid } = layout;
  const step = { x: layout.printable.width - overlap, y: layout.printable.height - overlap };
  return layout.sheets.map((sheet) => {
    const x = sheet.column * step.x;
    const y = sheet.row * step.y;
    const right = sheet.column === columns - 1 ? grid.width : x + step.x;
    const bottom = sheet.row === rows - 1 ? grid.height : y + step.y;
    return { label: sheet.label, x, y, width: right - x, height: bottom - y };
  });
}

export function overlap_bands(layout: PosterLayout): Box[] {
  if (layout.overlap <= 0) return [];
  const step = { x: layout.printable.width - layout.overlap, y: layout.printable.height - layout.overlap };
  const { width, height } = layout.grid;
  return [
    ...Array.from({ length: layout.columns - 1 }, (_, index) => ({ x: (index + 1) * step.x, y: 0, width: layout.overlap, height })),
    ...Array.from({ length: layout.rows - 1 }, (_, index) => ({ x: 0, y: (index + 1) * step.y, width, height: layout.overlap })),
  ];
}

export function tile_pixels(sheet: PosterSheet, dpi: number): Size {
  const scale = Math.min(1, MAX_DPI / dpi);
  return {
    width: Math.max(1, Math.round(sheet.source.width * scale)),
    height: Math.max(1, Math.round(sheet.source.height * scale)),
  };
}

export const MAP_MARGIN = 15;
export const MAP_HEADER = 16;
export const MAP_FOOTER = 22;

export interface MapLayout {
  page: Size;
  image: Box;
  grid: Box;
  cells: (Box & { label: string })[];
}

export function map_layout(layout: PosterLayout, paper: PosterPaper): MapLayout {
  const page = sheet_size(paper, layout.grid.width > layout.grid.height);
  const room = {
    width: page.width - MAP_MARGIN * 2,
    height: page.height - MAP_MARGIN * 2 - MAP_HEADER - MAP_FOOTER,
  };
  const scale = Math.min(room.width / layout.grid.width, room.height / layout.grid.height);
  const width = layout.grid.width * scale;
  const height = layout.grid.height * scale;
  const grid = { x: (page.width - width) / 2, y: MAP_MARGIN + MAP_HEADER + (room.height - height) / 2, width, height };
  const place = (box: Box) => ({ x: grid.x + box.x * scale, y: grid.y + box.y * scale, width: box.width * scale, height: box.height * scale });
  return {
    page,
    grid,
    image: place({ x: 0, y: 0, ...layout.poster }),
    cells: sheet_cells(layout).map((cell) => ({ ...place(cell), label: cell.label })),
  };
}

export function parse_length(text: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(mm|cm|in)?\s*$/i.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? "mm";
  return unit === "cm" ? value * 10 : unit === "in" ? value * 25.4 : value;
}

export function format_mm(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} m` : `${Math.round(value)} mm`;
}

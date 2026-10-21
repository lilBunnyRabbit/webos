import type { FontChoice } from "$lib/core/api/services/settings/type";

export const PageSize = { A4: "A4", LETTER: "Letter", A5: "A5" } as const;
export type PageSize = (typeof PageSize)[keyof typeof PageSize];
export const PAGE_SIZES = Object.values(PageSize);

export const Flow = { SHEETS: "sheets", CONTINUOUS: "continuous" } as const;
export type Flow = (typeof Flow)[keyof typeof Flow];
export const FLOWS = Object.values(Flow);

export const Orientation = { PORTRAIT: "portrait", LANDSCAPE: "landscape" } as const;
export type Orientation = (typeof Orientation)[keyof typeof Orientation];
export const ORIENTATIONS = Object.values(Orientation);

/** Millimetres from each edge of the page. */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageSettings {
  size: PageSize;
  flow: Flow;
  /** The body font; absent is Inter. */
  font?: FontChoice;
  /** Absent is portrait. */
  orientation?: Orientation;
  /** Absent is the size's own margins (Normal). */
  margins?: Margins;
}

export const DEFAULT_PAGE: PageSettings = { size: PageSize.A4, flow: Flow.SHEETS };

export interface PageBox {
  width: number;
  height: number;
  margin: number;
}

export const PAGE_MM: Record<PageSize, PageBox> = {
  A4: { width: 210, height: 297, margin: 20 },
  Letter: { width: 215.9, height: 279.4, margin: 20 },
  A5: { width: 148, height: 210, margin: 15 },
};

// The editor, the PDF and the .docx share these sizes (points) so all three look alike.
export const BASE_PT = 11;
export const HEADING_PT: Record<1 | 2 | 3, number> = { 1: 22, 2: 16, 3: 13 };
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36] as const;
export const LINE_HEIGHT = 1.4;
export const PARAGRAPH_AFTER_PT = 6;

export const MARGIN_MAX = 80;

export const MarginPreset = { NORMAL: "normal", NARROW: "narrow", WIDE: "wide", CUSTOM: "custom" } as const;
export type MarginPreset = (typeof MarginPreset)[keyof typeof MarginPreset];

// Word's Narrow (0.5 in) and Wide (1 in top and bottom, 2 in at the sides).
const PRESET_MARGINS: Record<"narrow" | "wide", Margins> = {
  narrow: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  wide: { top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 },
};

export function uniform(mm: number): Margins {
  return { top: mm, right: mm, bottom: mm, left: mm };
}

export function preset_margins(preset: Exclude<MarginPreset, "custom">, size: PageSize): Margins {
  return preset === MarginPreset.NORMAL ? uniform(PAGE_MM[size].margin) : { ...PRESET_MARGINS[preset] };
}

const same = (a: Margins, b: Margins) => a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

export function margin_preset(page: PageSettings): MarginPreset {
  if (!page.margins) return MarginPreset.NORMAL;
  for (const preset of [MarginPreset.NORMAL, MarginPreset.NARROW, MarginPreset.WIDE] as const) {
    if (same(page.margins, preset_margins(preset, page.size))) return preset;
  }
  return MarginPreset.CUSTOM;
}

/** The page as printed: width and height after orientation, in mm, and its margins. */
export interface PageGeometry {
  width: number;
  height: number;
  margins: Margins;
}

export function geometry(page: PageSettings): PageGeometry {
  const box = PAGE_MM[page.size];
  const landscape = page.orientation === Orientation.LANDSCAPE;
  return {
    width: landscape ? box.height : box.width,
    height: landscape ? box.width : box.height,
    margins: page.margins ?? uniform(box.margin),
  };
}

// A header sits halfway into the top margin (a footer into the bottom one), at most Word's 12.5 mm from the edge;
// when it's taller than the margin leaves room for, the body starts below it after a small gap, as in Word.
export const ZONE_GAP_MM = 4;
export const zone_distance = (margin: number) => Math.min(12.5, margin / 2);

export const mm_to_twips = (mm: number) => Math.round((mm / 25.4) * 1440);

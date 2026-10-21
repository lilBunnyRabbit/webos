export const PageSize = { A4: "A4", LETTER: "Letter", A5: "A5" } as const;
export type PageSize = (typeof PageSize)[keyof typeof PageSize];
export const PAGE_SIZES = Object.values(PageSize);

export const Flow = { SHEETS: "sheets", CONTINUOUS: "continuous" } as const;
export type Flow = (typeof Flow)[keyof typeof Flow];
export const FLOWS = Object.values(Flow);

export interface PageSettings {
  size: PageSize;
  flow: Flow;
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

export const mm_to_twips = (mm: number) => Math.round((mm / 25.4) * 1440);

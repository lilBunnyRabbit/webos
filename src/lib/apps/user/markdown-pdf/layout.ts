import { z } from "zod";
import { BRAND_LIGHT } from "$lib/core/api/services/settings/themes";
import { escape_html } from "./render";

export const Template = { CLEAN: "clean", REPORT: "report", NOTES: "notes" } as const;
export type Template = (typeof Template)[keyof typeof Template];

export const PageSize = { A4: "a4", LETTER: "letter" } as const;
export type PageSize = (typeof PageSize)[keyof typeof PageSize];

export const Orientation = { PORTRAIT: "portrait", LANDSCAPE: "landscape" } as const;
export type Orientation = (typeof Orientation)[keyof typeof Orientation];

export const Margins = { NARROW: "narrow", NORMAL: "normal", WIDE: "wide" } as const;
export type Margins = (typeof Margins)[keyof typeof Margins];

export const Font = { INTER: "inter", SERIF: "serif", SYSTEM: "system", MONO: "mono" } as const;
export type Font = (typeof Font)[keyof typeof Font];

export interface PdfSettings {
  template: Template;
  page_size: PageSize;
  orientation: Orientation;
  margins: Margins;
  font: Font;
  font_size: number;
  line_height: number;
  toc: boolean;
  show_title: boolean;
  show_date: boolean;
  page_numbers: boolean;
}

export const DEFAULT_SETTINGS: PdfSettings = {
  template: Template.CLEAN,
  page_size: PageSize.A4,
  orientation: Orientation.PORTRAIT,
  margins: Margins.NORMAL,
  font: Font.INTER,
  font_size: 11,
  line_height: 1.5,
  toc: false,
  show_title: true,
  show_date: false,
  page_numbers: true,
};

export const FONT_SIZE = { min: 8, max: 16, step: 0.5 } as const;
export const LINE_HEIGHT = { min: 1.1, max: 2, step: 0.05 } as const;

export const SettingsSchema: z.ZodType<PdfSettings> = z.object({
  template: z.enum(Template),
  page_size: z.enum(PageSize),
  orientation: z.enum(Orientation),
  margins: z.enum(Margins),
  font: z.enum(Font),
  font_size: z.number().min(FONT_SIZE.min).max(FONT_SIZE.max),
  line_height: z.number().min(LINE_HEIGHT.min).max(LINE_HEIGHT.max),
  toc: z.boolean(),
  show_title: z.boolean(),
  show_date: z.boolean(),
  page_numbers: z.boolean(),
});

export const TEMPLATE_LABELS: Record<Template, string> = { clean: "Clean", report: "Report", notes: "Notes" };
export const PAGE_SIZE_LABELS: Record<PageSize, string> = { a4: "A4", letter: "Letter" };
export const MARGIN_LABELS: Record<Margins, string> = { narrow: "Narrow", normal: "Normal", wide: "Wide" };
export const FONT_LABELS: Record<Font, string> = { inter: "Inter", serif: "Serif", system: "System", mono: "Hack (mono)" };

const PAGE_MM: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
};
const MARGIN_MM: Record<Margins, number> = { narrow: 12.7, normal: 20, wide: 30 };
const FONT_STACKS: Record<Font, string> = {
  inter: "Inter, ui-sans-serif, system-ui, sans-serif",
  serif: 'Georgia, "Times New Roman", serif',
  system: "system-ui, -apple-system, sans-serif",
  mono: "Hack, ui-monospace, monospace",
};
const MONO_STACK = FONT_STACKS.mono;

export const PAGE_GAP_MM = 6;
export const PX_PER_MM = 96 / 25.4;

export interface PageBox {
  width: number;
  height: number;
  margin: number;
}

export function page_box(settings: PdfSettings): PageBox {
  const { width, height } = PAGE_MM[settings.page_size];
  const landscape = settings.orientation === Orientation.LANDSCAPE;
  return { width: landscape ? height : width, height: landscape ? width : height, margin: MARGIN_MM[settings.margins] };
}

export function count_pages(flow_height: number, box: PageBox): number {
  const content = box.height - 2 * box.margin;
  const gap = 2 * box.margin + PAGE_GAP_MM;
  return Math.max(1, Math.round((flow_height + gap) / (content + gap)));
}

export function css_string(text: string): string {
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/[\r\n]+/g, " ")}"`;
}

export interface DocumentMeta {
  title: string;
  date: string;
}

export interface FontUrls {
  inter: string;
  hack_regular: string;
  hack_bold: string;
}

export function font_faces(fonts: FontUrls): string {
  return [
    `@font-face{font-family:Inter;src:url("${fonts.inter}") format("woff2");font-weight:100 900}`,
    `@font-face{font-family:Hack;src:url("${fonts.hack_regular}") format("woff2");font-weight:400}`,
    `@font-face{font-family:Hack;src:url("${fonts.hack_bold}") format("woff2");font-weight:700}`,
  ].join("");
}

// The document is paper, not UI: it always uses Brand Light, whatever the OS theme.
const VARS = Object.entries(BRAND_LIGHT)
  .map(([key, value]) => `--${key.replaceAll("_", "-")}:${value}`)
  .join(";");
const MUTED = `color-mix(in oklch,${BRAND_LIGHT.foreground} 65%,transparent)`;

/** `brk` is how a forced break is spelled: `page` when printing, `column` in the paged preview. */
export function document_css(settings: PdfSettings, brk: "page" | "column"): string {
  const hairline = "color-mix(in oklch,var(--foreground) 16%,transparent)";
  const base = `
:root{${VARS}}
*,*::before,*::after{box-sizing:border-box}
.doc{color:var(--foreground);font-family:${FONT_STACKS[settings.font]};font-size:${settings.font_size}pt;line-height:${settings.line_height};overflow-wrap:break-word;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.doc h1,.doc h2,.doc h3,.doc h4,.doc h5,.doc h6{line-height:1.25;margin:1.4em 0 .5em;font-weight:650;break-after:avoid}
.doc>:first-child,.doc>.toc+*{margin-top:0}
.doc h1{font-size:2em;font-weight:700}.doc h2{font-size:1.45em}.doc h3{font-size:1.2em}.doc h4,.doc h5,.doc h6{font-size:1em}
.doc p,.doc ul,.doc ol,.doc blockquote,.doc pre,.doc table{margin:0 0 .85em}
.doc p,.doc li{orphans:3;widows:3}
.doc ul,.doc ol{padding-left:1.4em}.doc li+li{margin-top:.2em}.doc li>p{margin:0}
.doc li:has(>input[type=checkbox]){list-style:none;margin-left:-1.3em}
.doc input[type=checkbox]{appearance:none;display:inline-grid;place-content:center;width:.85em;height:.85em;margin:0 .45em 0 0;vertical-align:-.08em;border:1.5px solid color-mix(in oklch,var(--foreground) 50%,transparent);border-radius:2px}
.doc input[type=checkbox]:checked{background:var(--primary);border-color:var(--primary)}
.doc input[type=checkbox]:checked::after{content:"";width:.22em;height:.45em;margin-top:-.08em;border:solid var(--background-lightest);border-width:0 .12em .12em 0;rotate:45deg}
.doc a{color:var(--primary);text-underline-offset:2px}
.doc strong{font-weight:650}
.doc code,.doc pre,.doc kbd{font-family:${MONO_STACK};font-size:.86em}
.doc :not(pre)>code{background:var(--background);padding:.1em .3em;border-radius:3px}
.doc pre{background:var(--background-lighter);border:1px solid ${hairline};border-radius:4px;padding:.7em .9em;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45}
.doc pre code{font-size:1em;background:none;padding:0}
.doc blockquote{margin-left:0;padding:.1em 0 .1em 1em;border-left:3px solid color-mix(in oklch,var(--primary) 45%,transparent);color:color-mix(in oklch,var(--foreground) 85%,transparent)}
.doc hr{border:0;border-top:1px solid ${hairline};margin:1.5em 0}
.doc table{border-collapse:collapse;width:100%;font-size:.92em}
.doc thead{display:table-header-group}
.doc tr,.doc img{break-inside:avoid}
.doc th,.doc td{border:1px solid ${hairline};padding:.35em .6em;text-align:left;vertical-align:top}
.doc th[align=right],.doc td[align=right]{text-align:right}
.doc th[align=center],.doc td[align=center]{text-align:center}
.doc th{background:var(--background-lighter);font-weight:650}
.doc img{max-width:100%;height:auto}
.doc .toc{break-after:${brk}}
.doc .toc-title{font-size:1.45em;font-weight:650;margin:0 0 .6em}
.doc .toc ol{list-style:none;padding:0;margin:0}
.doc .toc li{margin:0;padding:.3em 0;border-bottom:1px dotted ${hairline}}
.doc .toc .toc-2{padding-left:1.4em;font-size:.95em}
.doc .toc a{color:inherit;text-decoration:none}
`;
  return base + TEMPLATES[settings.template](brk);
}

const TEMPLATES: Record<Template, (brk: string) => string> = {
  clean: () => `
.doc h2{padding-bottom:.25em;border-bottom:1px solid color-mix(in oklch,var(--foreground) 14%,transparent)}
`,
  report: (brk) => `
.doc{text-align:justify;hyphens:auto;counter-reset:h2}
.doc h1,.doc h2,.doc h3,.doc th:not([align]),.doc td:not([align]),.doc pre{text-align:left;hyphens:manual}
.doc h1{font-size:2.2em;text-align:center;color:var(--primary);padding-bottom:.4em;border-bottom:2px solid var(--primary);margin-bottom:1.2em}
.doc h1:not(:first-child){break-before:${brk}}
.doc .toc+h1{break-before:auto}
.doc h2{counter-reset:h3;counter-increment:h2;color:var(--primary)}
.doc h3{counter-increment:h3}
.doc h2::before{content:counter(h2) ".\\2002"}
.doc h3::before{content:counter(h2) "." counter(h3) "\\2002";color:var(--primary)}
.doc blockquote{font-style:italic}
`,
  notes: () => `
.doc p,.doc ul,.doc ol,.doc blockquote,.doc pre,.doc table{margin-bottom:.55em}
.doc h1,.doc h2,.doc h3,.doc h4{margin:1em 0 .35em}
.doc h1{font-size:1.5em;padding-left:.5em;border-left:4px solid var(--primary)}
.doc h2{font-size:.85em;text-transform:uppercase;letter-spacing:.07em;color:var(--primary)}
.doc h3{font-size:1.05em}
.doc li+li{margin-top:.05em}
.doc blockquote{border:0;border-radius:4px;background:var(--background-lighter);padding:.5em .8em;color:var(--foreground)}
`,
};

function margin_box(content: string, settings: PdfSettings): string {
  return `content:${content};font-family:${FONT_STACKS[settings.font]};font-size:8pt;color:${MUTED}`;
}

export function print_css(settings: PdfSettings, meta: DocumentMeta): string {
  const box = page_box(settings);
  const size = `${settings.page_size === PageSize.A4 ? "A4" : "letter"} ${settings.orientation}`;
  const boxes = [
    settings.show_title && `@top-left{${margin_box(css_string(meta.title), settings)}}`,
    settings.show_date && `@top-right{${margin_box(css_string(meta.date), settings)}}`,
    settings.page_numbers && `@bottom-right{${margin_box('counter(page) " / " counter(pages)', settings)}}`,
  ].filter(Boolean);
  return `@page{size:${size};margin:${box.margin}mm;${boxes.join("")}}
html,body{margin:0;padding:0;background:none}`;
}

export interface PreviewColors {
  desk: string;
  foreground: string;
}

export function preview_css(settings: PdfSettings, colors: PreviewColors): string {
  const { width, height, margin } = page_box(settings);
  const content_w = width - 2 * margin;
  const content_h = height - 2 * margin;
  const label = FONT_STACKS[settings.font];
  return `
html{background:${colors.desk};color-scheme:light;scrollbar-color:color-mix(in oklch,${colors.foreground} 30%,transparent) transparent}
body{margin:0;padding:16px 0;container-type:inline-size}
.paper{width:${width}mm;margin:0 auto;zoom:min(1,calc((100cqi - 24px) / ${width}mm))}
.sheets{position:relative;padding:${margin}mm;background:repeating-linear-gradient(to bottom,var(--background-lightest) 0 ${height}mm,transparent ${height}mm ${height + PAGE_GAP_MM}mm)}
.flow{width:${content_w}mm;column-width:${content_w}mm;column-height:${content_h}mm;column-wrap:wrap;column-fill:auto;column-gap:0;row-gap:${2 * margin + PAGE_GAP_MM}mm}
.marks{position:absolute;inset:0;pointer-events:none}
.mark{position:absolute;left:0;right:0;height:${height}mm}
.mark>div{position:absolute;left:${margin}mm;right:${margin}mm;height:${margin}mm;display:flex;align-items:center;justify-content:space-between;gap:1em;font-family:${label};font-size:8pt;color:${MUTED};white-space:nowrap}
.mark>div>span{overflow:hidden;text-overflow:ellipsis}
.mark-top{top:0}.mark-bottom{bottom:0;justify-content:flex-end!important}
`;
}

export function marks_html(pages: number, settings: PdfSettings, meta: DocumentMeta): string {
  const { height } = page_box(settings);
  const title = settings.show_title ? escape_html(meta.title) : "";
  const date = settings.show_date ? escape_html(meta.date) : "";
  let html = "";
  for (let page = 0; page < pages; page++) {
    const top = `<div class="mark-top"><span>${title}</span><span>${date}</span></div>`;
    const bottom = settings.page_numbers ? `<div class="mark-bottom"><span>${page + 1} / ${pages}</span></div>` : "";
    html += `<div class="mark" style="top:${page * (height + PAGE_GAP_MM)}mm">${top}${bottom}</div>`;
  }
  return html;
}

// No script may run in either frame; the CSP also keeps Markdown from loading anything but images.
const CSP = `default-src 'none'; img-src * data: blob:; style-src 'unsafe-inline'; font-src 'self'`;

function head(title: string, style: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${escape_html(title)}</title>
<base target="_blank">
<style>${style}</style>`;
}

export function print_document(body: string, settings: PdfSettings, meta: DocumentMeta, fonts: FontUrls): string {
  const style = font_faces(fonts) + document_css(settings, "page") + print_css(settings, meta);
  return `${head(meta.title, style)}</head><body><main class="doc">${body}</main></body></html>`;
}

/** The preview frame's fixed shell: the app fills `#style`, `#content` and `#marks` in place, so typing never reloads it. */
export function preview_shell(fonts: FontUrls): string {
  return `${head("Preview", font_faces(fonts))}<style id="style"></style></head>
<body><div class="paper"><div class="sheets"><div class="flow"><article class="doc" id="content"></article></div><div class="marks" id="marks"></div></div></div></body></html>`;
}

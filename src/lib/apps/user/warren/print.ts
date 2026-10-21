import { BRAND_LIGHT } from "$lib/core/api/services/settings/themes";
import { escape_html } from "$lib/core/utils";
import type { DocNode, EditorJson, WarrenDocument } from "./format";
import {
  align_of,
  BOLD,
  fill_tokens,
  font_size,
  IMAGE,
  image_align,
  image_width,
  ITALIC,
  LINK_TYPES,
  PAGE_BREAK,
  RULE,
  safe_image,
  safe_url,
  STRIKETHROUGH,
  SUBSCRIPT,
  SUPERSCRIPT,
  UNDERLINE,
} from "./model";
import { BASE_PT, geometry, HEADING_PT, LINE_HEIGHT, Orientation, PageSize, PARAGRAPH_AFTER_PT, ZONE_GAP_MM, zone_distance } from "./page";

const CSS_SIZE: Record<PageSize, string> = { A4: "A4", Letter: "letter", A5: "A5" };
const CSP = `default-src 'none'; style-src 'unsafe-inline'; font-src 'self' data: blob:; img-src data:`;

// Shared with the editor, so what prints is what was typed.
export const BODY_FAMILY = "warren-body";

// Lexical's theme classes for check lists; the printed page uses the same ones.
export const CHECK_CLASS = { list: "wr-check", checked: "wr-checked", unchecked: "wr-unchecked" } as const;

/** `family` is a CSS family list item: a quoted name, or `var(…)` in the editor. */
export function document_css(scope: string, family = "Inter"): string {
  return `
${scope}{font-family:${family},Inter,ui-sans-serif,system-ui,sans-serif;font-size:${BASE_PT}pt;line-height:${LINE_HEIGHT};overflow-wrap:break-word;white-space:pre-wrap}
${scope} p{margin:0 0 ${PARAGRAPH_AFTER_PT}pt}
${scope} h1,${scope} h2,${scope} h3,${scope} h4,${scope} h5,${scope} h6{font-weight:700;line-height:1.2;margin:${HEADING_PT[3] * 0.8}pt 0 ${PARAGRAPH_AFTER_PT}pt;break-after:avoid}
${scope} h1{font-size:${HEADING_PT[1]}pt;margin-top:${HEADING_PT[1] * 0.8}pt}
${scope} h2{font-size:${HEADING_PT[2]}pt;margin-top:${HEADING_PT[2] * 0.8}pt}
${scope} h3,${scope} h4,${scope} h5,${scope} h6{font-size:${HEADING_PT[3]}pt}
${scope}>:first-child{margin-top:0}
${scope} ul,${scope} ol{margin:0 0 ${PARAGRAPH_AFTER_PT}pt;padding-left:1.5em}
${scope} ul{list-style-type:disc}${scope} ol{list-style-type:decimal}
${scope} li{margin:0 0 ${PARAGRAPH_AFTER_PT / 3}pt}
${scope} li>ul,${scope} li>ol{margin:${PARAGRAPH_AFTER_PT / 3}pt 0 0}
${scope} ul ul{list-style-type:circle}${scope} ul ul ul{list-style-type:square}
${scope} ol ol{list-style-type:lower-alpha}${scope} ol ol ol{list-style-type:lower-roman}
${scope} li.nested{list-style:none}
${scope} strong,${scope} b{font-weight:700}
${scope} a{color:var(--link,currentColor);text-decoration:underline}
${scope} sub,${scope} sup{font-size:0.75em;line-height:0}
${scope} hr{height:0;margin:${PARAGRAPH_AFTER_PT * 1.5}pt 0;border:0;border-top:0.75pt solid color-mix(in oklch,currentColor 40%,transparent)}
${scope} ul.${CHECK_CLASS.list}{list-style:none;padding-left:0}
${scope} ul.${CHECK_CLASS.list} ul.${CHECK_CLASS.list}{padding-left:1.5em}
${scope} li.${CHECK_CLASS.checked},${scope} li.${CHECK_CLASS.unchecked}{position:relative;padding-left:1.5em;list-style:none}
${scope} li.${CHECK_CLASS.checked}::before,${scope} li.${CHECK_CLASS.unchecked}::before{content:"";position:absolute;left:0;top:calc(0.5lh - 0.5em);box-sizing:border-box;width:1em;height:1em;border:1.5px solid color-mix(in oklch,currentColor 70%,transparent);border-radius:0.2em}
${scope} li.${CHECK_CLASS.checked}::before{border-color:var(--link,currentColor);background:var(--link,currentColor)}
${scope} li.${CHECK_CLASS.checked}::after{content:"";position:absolute;left:0.36em;top:calc(0.5lh - 0.34em);width:0.22em;height:0.5em;border:solid var(--background-lightest);border-width:0 2px 2px 0;rotate:45deg;pointer-events:none}
${scope} li.${CHECK_CLASS.checked}{text-decoration:line-through;color:color-mix(in oklch,currentColor 60%,transparent)}
${scope} li.nested::before,${scope} li.nested::after{display:none}
`;
}

function text_html(node: DocNode): string {
  const format = typeof node.format === "number" ? node.format : 0;
  let html = escape_html(node.text ?? "");
  const size = font_size(node.style);
  if (size !== null) html = `<span style="font-size:${size}pt">${html}</span>`;
  if (format & UNDERLINE) html = `<u>${html}</u>`;
  if (format & SUBSCRIPT) html = `<sub>${html}</sub>`;
  else if (format & SUPERSCRIPT) html = `<sup>${html}</sup>`;
  if (format & STRIKETHROUGH) html = `<s>${html}</s>`;
  if (format & ITALIC) html = `<em>${html}</em>`;
  if (format & BOLD) html = `<strong>${html}</strong>`;
  return html;
}

function inline_html(nodes: DocNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "text") return text_html(node);
      if (node.type === "tab") return "\t";
      if (node.type === "linebreak") return "<br>";
      if (!node.children) return "";
      const url = LINK_TYPES.includes(node.type) ? safe_url(node.url) : null;
      return url ? `<a href="${escape_html(url)}">${inline_html(node.children)}</a>` : inline_html(node.children);
    })
    .join("");
}

const filled = (html: string) => html || "<br>";

function align_attr(node: DocNode): string {
  const align = align_of(node);
  return align ? ` style="text-align:${align}"` : "";
}

function list_html(node: DocNode): string {
  const ordered = node.listType === "number";
  const check = node.listType === "check";
  const start = ordered && typeof node.start === "number" && node.start > 1 ? ` start="${Math.floor(node.start)}"` : "";
  const items = (node.children ?? [])
    .map((item) => {
      const children = item.children ?? [];
      const nested = children.filter((child) => child.type === "list");
      const inline = children.filter((child) => child.type !== "list");
      const only_nested = nested.length > 0 && inline.length === 0;
      const classes = [only_nested && "nested", check && !only_nested && (item.checked ? CHECK_CLASS.checked : CHECK_CLASS.unchecked)].filter(Boolean);
      return `<li${classes.length ? ` class="${classes.join(" ")}"` : ""}${align_attr(item)}>${only_nested ? "" : filled(inline_html(inline))}${nested.map(list_html).join("")}</li>`;
    })
    .join("");
  if (ordered) return `<ol${start}>${items}</ol>`;
  return check ? `<ul class="${CHECK_CLASS.list}">${items}</ul>` : `<ul>${items}</ul>`;
}

function image_html(node: DocNode): string {
  const src = safe_image(node.src);
  if (!src) return "";
  return `<div class="picture" style="text-align:${image_align(node.align)}"><img src="${src}" alt="${escape_html(node.alt ?? "")}" style="width:${image_width(node.width)}%"></div>`;
}

export function blocks_html(editor: EditorJson): string {
  return editor.root.children
    .map((node) => {
      if (node.type === PAGE_BREAK) return `<div class="break"></div>`;
      if (node.type === RULE) return "<hr>";
      if (node.type === IMAGE) return image_html(node);
      if (node.type === "list") return list_html(node);
      if (node.type === "heading") {
        const level = Math.min(Math.max(Number(node.tag?.slice(1)) || 3, 1), 3);
        return `<h${level}${align_attr(node)}>${filled(inline_html(node.children))}</h${level}>`;
      }
      return `<p${align_attr(node)}>${filled(inline_html(node.children))}</p>`;
    })
    .join("");
}

export function body_html(document: WarrenDocument): string {
  return blocks_html(document.editor);
}

/** Where the body starts and ends on every page (mm), and how many pages there are, measured before printing. */
export interface PrintLayout {
  pages: number;
  top: number;
  bottom: number;
}

export function has_zones(document: WarrenDocument): boolean {
  return !!(document.header || document.footer);
}

/** The body's top and bottom padding when a header or footer of the given height (mm) sits in the margin. */
export function zone_padding(document: WarrenDocument, header: number, footer: number): { top: number; bottom: number } {
  const { margins } = geometry(document.page);
  const reach = (margin: number, height: number) => (height > 0 ? Math.max(margin, zone_distance(margin) + height + ZONE_GAP_MM) : margin);
  return { top: reach(margins.top, document.header ? header : 0), bottom: reach(margins.bottom, document.footer ? footer : 0) };
}

const round = (mm: number) => Math.round(mm * 100) / 100;

/**
 * The printable page. Without a header or footer the body sits in `@page` margins. With one, Chrome can print page
 * numbers only in `@page` margin boxes, which hold plain text, so the page has no margins: the body's padding repeats
 * on every page (`box-decoration-break: clone`) and each page gets its own header and footer, absolutely placed, with
 * its numbers filled in. That needs the page count and the zones' heights first: `layout` comes from `measure_layout`
 * over this same page printed with `"measure"`, which lays the body out in page-tall columns instead.
 * `body_faces` is the document font's `@font-face` rules for `BODY_FAMILY`; without it the page is set in Inter.
 */
export function print_document(document: WarrenDocument, title: string, inter_url: string, body_faces = "", layout: PrintLayout | "measure" | null = null): string {
  const page = geometry(document.page);
  const { margins } = page;
  const orientation = document.page.orientation === Orientation.LANDSCAPE ? "landscape" : "portrait";
  const family = body_faces ? `"${BODY_FAMILY}"` : "Inter";
  const zones = has_zones(document);
  const padding = layout && layout !== "measure" ? layout : { pages: 1, top: margins.top, bottom: margins.bottom };
  let style =
    `@font-face{font-family:Inter;src:url("${inter_url}") format("woff2");font-weight:100 900}` +
    body_faces +
    `html,body{--link:${BRAND_LIGHT.primary};--background-lightest:${BRAND_LIGHT.background_lightest};margin:0;padding:0;background:none;color:${BRAND_LIGHT.foreground};-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `.break{break-before:page;height:0}` +
    `.picture{margin:0 0 ${PARAGRAPH_AFTER_PT}pt;break-inside:avoid}.picture img{max-width:100%;height:auto;vertical-align:top}` +
    document_css(".doc", family);
  let zones_html = "";
  if (!zones) {
    style += `@page{size:${CSS_SIZE[document.page.size]} ${orientation};margin:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm}`;
  } else {
    style +=
      `@page{size:${CSS_SIZE[document.page.size]} ${orientation};margin:0}` +
      `body{position:relative}` +
      `.doc{padding:${round(padding.top)}mm ${margins.right}mm ${round(padding.bottom)}mm ${margins.left}mm;-webkit-box-decoration-break:clone;box-decoration-break:clone}` +
      `.zone{position:absolute;left:${margins.left}mm;right:${margins.right}mm}.zone>:last-child{margin-bottom:0}` +
      document_css(".zone", family) +
      `html.measure .zone{position:static;margin:0 ${margins.right}mm 0 ${margins.left}mm}` +
      `html.paginate .zone{display:none}html.paginate main{columns:1;column-gap:0;column-fill:auto;width:${page.width}mm;height:${page.height}mm}` +
      `html.paginate .break{break-before:column}`;
    const head = document.header ? blocks_html(document.header) : "";
    const foot = document.footer ? blocks_html(document.footer) : "";
    if (layout === "measure") {
      zones_html = `${head ? `<div class="zone head">${fill_tokens(head, 88, 88)}</div>` : ""}${foot ? `<div class="zone foot">${fill_tokens(foot, 88, 88)}</div>` : ""}`;
    } else {
      for (let index = 0; index < padding.pages; index++) {
        const number = index + 1;
        if (head) zones_html += `<div class="zone head" style="top:${round(index * page.height + zone_distance(margins.top))}mm">${fill_tokens(head, number, padding.pages)}</div>`;
        if (foot) {
          zones_html += `<div class="zone foot" style="top:${round((index + 1) * page.height - zone_distance(margins.bottom))}mm;translate:0 -100%">${fill_tokens(foot, number, padding.pages)}</div>`;
        }
      }
    }
  }
  return `<!doctype html><html lang="en"${layout === "measure" ? ` class="measure"` : ""}><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${escape_html(title)}</title>
<style>${style}</style></head><body>${zones_html}<main><div class="doc">${body_html(document)}</div></main></body></html>`;
}


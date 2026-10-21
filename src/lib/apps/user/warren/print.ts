import { BRAND_LIGHT } from "$lib/core/api/services/settings/themes";
import { escape_html } from "$lib/core/utils";
import type { DocNode, WarrenDocument } from "./format";
import { align_of, BOLD, font_size, ITALIC, LINK_TYPES, PAGE_BREAK, RULE, safe_url, STRIKETHROUGH, SUBSCRIPT, SUPERSCRIPT, UNDERLINE } from "./model";
import { BASE_PT, HEADING_PT, LINE_HEIGHT, PAGE_MM, PageSize, PARAGRAPH_AFTER_PT } from "./page";

const CSS_SIZE: Record<PageSize, string> = { A4: "A4", Letter: "letter", A5: "A5" };
const CSP = `default-src 'none'; style-src 'unsafe-inline'; font-src 'self' data: blob:`;

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

export function body_html(document: WarrenDocument): string {
  return document.editor.root.children
    .map((node) => {
      if (node.type === PAGE_BREAK) return `<div class="break"></div>`;
      if (node.type === RULE) return "<hr>";
      if (node.type === "list") return list_html(node);
      if (node.type === "heading") {
        const level = Math.min(Math.max(Number(node.tag?.slice(1)) || 3, 1), 3);
        return `<h${level}${align_attr(node)}>${filled(inline_html(node.children))}</h${level}>`;
      }
      return `<p${align_attr(node)}>${filled(inline_html(node.children))}</p>`;
    })
    .join("");
}

/** `body_faces` is the document font's `@font-face` rules for `BODY_FAMILY`; without it the page is set in Inter. */
export function print_document(document: WarrenDocument, title: string, inter_url: string, body_faces = ""): string {
  const page = PAGE_MM[document.page.size];
  const style =
    `@font-face{font-family:Inter;src:url("${inter_url}") format("woff2");font-weight:100 900}` +
    body_faces +
    `@page{size:${CSS_SIZE[document.page.size]} portrait;margin:${page.margin}mm}` +
    `html,body{--link:${BRAND_LIGHT.primary};--background-lightest:${BRAND_LIGHT.background_lightest};margin:0;padding:0;background:none;color:${BRAND_LIGHT.foreground};-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `.break{break-before:page;height:0}` +
    document_css(".doc", body_faces ? `"${BODY_FAMILY}"` : "Inter");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${escape_html(title)}</title>
<style>${style}</style></head><body><main class="doc">${body_html(document)}</main></body></html>`;
}

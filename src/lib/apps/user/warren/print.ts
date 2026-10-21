import { BRAND_LIGHT } from "$lib/core/api/services/settings/themes";
import { escape_html } from "$lib/core/utils";
import type { DocNode, WarrenDocument } from "./format";
import { align_of, BOLD, font_size, ITALIC, PAGE_BREAK, STRIKETHROUGH, UNDERLINE } from "./model";
import { BASE_PT, HEADING_PT, LINE_HEIGHT, PAGE_MM, PageSize, PARAGRAPH_AFTER_PT } from "./page";

const CSS_SIZE: Record<PageSize, string> = { A4: "A4", Letter: "letter", A5: "A5" };
const CSP = `default-src 'none'; style-src 'unsafe-inline'; font-src 'self' data: blob:`;

// Shared with the editor, so what prints is what was typed.
export function document_css(scope: string): string {
  return `
${scope}{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:${BASE_PT}pt;line-height:${LINE_HEIGHT};overflow-wrap:break-word;white-space:pre-wrap}
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
`;
}

function text_html(node: DocNode): string {
  const format = typeof node.format === "number" ? node.format : 0;
  let html = escape_html(node.text ?? "");
  const size = font_size(node.style);
  if (size !== null) html = `<span style="font-size:${size}pt">${html}</span>`;
  if (format & UNDERLINE) html = `<u>${html}</u>`;
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
      return node.children ? inline_html(node.children) : "";
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
  const start = ordered && typeof node.start === "number" && node.start > 1 ? ` start="${Math.floor(node.start)}"` : "";
  const items = (node.children ?? [])
    .map((item) => {
      const children = item.children ?? [];
      const nested = children.filter((child) => child.type === "list");
      const inline = children.filter((child) => child.type !== "list");
      const only_nested = nested.length > 0 && inline.length === 0;
      return `<li${only_nested ? ` class="nested"` : ""}${align_attr(item)}>${only_nested ? "" : filled(inline_html(inline))}${nested.map(list_html).join("")}</li>`;
    })
    .join("");
  return ordered ? `<ol${start}>${items}</ol>` : `<ul>${items}</ul>`;
}

export function body_html(document: WarrenDocument): string {
  return document.editor.root.children
    .map((node) => {
      if (node.type === PAGE_BREAK) return `<div class="break"></div>`;
      if (node.type === "list") return list_html(node);
      if (node.type === "heading") {
        const level = Math.min(Math.max(Number(node.tag?.slice(1)) || 3, 1), 3);
        return `<h${level}${align_attr(node)}>${filled(inline_html(node.children))}</h${level}>`;
      }
      return `<p${align_attr(node)}>${filled(inline_html(node.children))}</p>`;
    })
    .join("");
}

export function print_document(document: WarrenDocument, title: string, inter_url: string): string {
  const page = PAGE_MM[document.page.size];
  const style =
    `@font-face{font-family:Inter;src:url("${inter_url}") format("woff2");font-weight:100 900}` +
    `@page{size:${CSS_SIZE[document.page.size]} portrait;margin:${page.margin}mm}` +
    `html,body{margin:0;padding:0;background:none;color:${BRAND_LIGHT.foreground};-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `.break{break-before:page;height:0}` +
    document_css(".doc");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${escape_html(title)}</title>
<style>${style}</style></head><body><main class="doc">${body_html(document)}</main></body></html>`;
}

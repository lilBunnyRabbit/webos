import { Marked, type Tokens } from "marked";
import { badge } from "$lib/core/components/ui/variants";
import { STATUS_TONES, status_kind } from "./adr-index";
import { resolve_link } from "./catalog";
import { Slugger } from "./outline";

const escape_html = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function link_html(from: string, href: string, label: string, title: string | null | undefined, ids: ReadonlySet<string>): string {
  const target = resolve_link(from, href, ids);
  const title_attr = title ? ` title="${escape_html(title)}"` : "";
  if (target.kind === "doc") {
    return `<a href="#" data-doc="${escape_html(target.id)}" data-hash="${escape_html(target.hash)}"${title_attr}>${label}</a>`;
  }
  if (target.kind === "anchor") return `<a href="#${escape_html(target.hash)}" data-hash="${escape_html(target.hash)}"${title_attr}>${label}</a>`;
  return `<a href="${escape_html(target.url)}" target="_blank" rel="noopener noreferrer" data-external${title_attr}>${label}</a>`;
}

// The markdown is the repo's own docs, bundled at build time, so it's trusted and goes in without Text Editor's sandbox.
export function render_markdown(markdown: string, from: string, ids: ReadonlySet<string>): string {
  const slugger = new Slugger();
  // The reader draws the title itself, above the page's generated visual.
  let titled = false;
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading) {
        const id = slugger.slug(text);
        if (depth === 1 && !titled) {
          titled = true;
          return "";
        }
        const inner = this.parser.parseInline(tokens);
        if (depth === 1) return `<h1 id="${escape_html(id)}">${inner}</h1>\n`;
        return `<h${depth} id="${escape_html(id)}"><a class="anchor" href="#${escape_html(id)}" data-hash="${escape_html(id)}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${depth}>\n`;
      },
      link({ href, title, tokens }: Tokens.Link) {
        return link_html(from, href, this.parser.parseInline(tokens), title, ids);
      },
      paragraph({ tokens, raw }: Tokens.Paragraph) {
        const header = /^\*\*Date:\*\*\s*(.+)\n\*\*Status:\*\*\s*(.+)$/.exec(raw.trim());
        if (header) {
          const status = marked.parseInline(header[2]) as string;
          const tone = STATUS_TONES[status_kind(header[2])];
          return `<p class="adr-meta"><span class="${badge({ tone })}">${status}</span><time>${escape_html(header[1])}</time></p>\n`;
        }
        return `<p>${this.parser.parseInline(tokens)}</p>\n`;
      },
      blockquote({ tokens, raw }: Tokens.Blockquote) {
        const body = this.parser.parse(tokens);
        if (/^>\s*\*\*Revision\b/i.test(raw.trim())) return `<aside class="callout" data-kind="revision">${body}</aside>\n`;
        if (/^>\s*\*\*(Note|Warning|Why|Rule)\b/i.test(raw.trim())) return `<aside class="callout">${body}</aside>\n`;
        return `<blockquote>${body}</blockquote>\n`;
      },
      table(token: Tokens.Table) {
        const cell = (item: Tokens.TableCell, tag: "th" | "td") =>
          `<${tag}${item.align ? ` style="text-align:${item.align}"` : ""}>${this.parser.parseInline(item.tokens)}</${tag}>`;
        const head = `<tr>${token.header.map((item) => cell(item, "th")).join("")}</tr>`;
        const rows = token.rows.map((row) => `<tr>${row.map((item) => cell(item, "td")).join("")}</tr>`).join("\n");
        return `<div class="table-wrap" tabindex="0"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>\n`;
      },
      code({ text, lang }: Tokens.Code) {
        const language = (lang ?? "").split(/\s/)[0];
        const label = language ? `<span class="code-lang">${escape_html(language)}</span>` : "";
        return `<div class="code-block">${label}<pre tabindex="0"><code>${escape_html(text)}</code></pre></div>\n`;
      },
    },
  });
  return marked.parse(markdown, { async: false }) as string;
}

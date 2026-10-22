import { escape_html } from "$lib/core/utils/utils";
import { split_media, type Entry } from "./journal";
import { MOOD_LABELS, mood_level } from "./mood";

export interface ExportInput {
  title: string;
  from: string;
  to: string;
  entries: Entry[];
  media: ReadonlyMap<string, string>;
  activities?: ReadonlyMap<string, string>;
}

export function mood_line(entry: Entry, activities: ReadonlyMap<string, string> = new Map()): string {
  const parts: string[] = [];
  if (entry.mood) parts.push(`Mood: ${MOOD_LABELS[mood_level(entry.mood)]}`);
  if (entry.activities?.length) parts.push(entry.activities.map((id) => activities.get(id) ?? id).join(", "));
  if (entry.energy !== undefined) parts.push(`Energy ${entry.energy}/10`);
  if (entry.sleep !== undefined) parts.push(`Sleep ${entry.sleep} h`);
  return parts.join(" · ");
}

export function in_range(entries: readonly Entry[], from: string, to: string): Entry[] {
  return entries.filter((entry) => entry.date >= from && entry.date <= to).sort((a, b) => (a.date === b.date ? a.created - b.created : a.date < b.date ? -1 : 1));
}

function day_label(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function time_label(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function export_markdown(input: ExportInput): string {
  const lines = [`# ${input.title}`, "", `${input.from} to ${input.to}`, ""];
  for (const entry of input.entries) {
    lines.push(`## ${day_label(entry.date)} · ${time_label(entry.created)}`, "");
    const mood = mood_line(entry, input.activities);
    if (mood) lines.push(`_${mood}_`, "");
    const body = split_media(entry.body)
      .map((part) => ("text" in part ? part.text : input.media.has(part.media) ? `![photo](${input.media.get(part.media)})` : "(photo missing)"))
      .join("");
    lines.push(body.trim(), "");
  }
  return `${lines.join("\n").trim()}\n`;
}

function inline(text: string): string {
  return escape_html(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

function text_html(text: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of text.split("\n")) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) {
        close();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
      continue;
    }
    close();
    if (heading) out.push(`<h4>${inline(heading[2])}</h4>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join("");
}

/** A printable page; data URLs are the only images, so the script-less print frame needs nothing from outside. */
export function export_html(input: ExportInput): string {
  const days = input.entries
    .map((entry) => {
      const body = split_media(entry.body)
        .map((part) => {
          if ("text" in part) return text_html(part.text);
          const src = input.media.get(part.media);
          return src && /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(src) ? `<img src="${src}" alt="Photo">` : "<p><em>(photo missing)</em></p>";
        })
        .join("");
      const mood = mood_line(entry, input.activities);
      return `<article><h2>${escape_html(day_label(entry.date))}<span>${escape_html(time_label(entry.created))}</span></h2>${mood ? `<p class="mood">${escape_html(mood)}</p>` : ""}${body}</article>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape_html(input.title)}</title><style>
body{font:11pt/1.55 system-ui,sans-serif;color:#111;margin:0 auto;max-width:42rem;padding:1.5rem}
h1{font-size:18pt;margin:0}.range{color:#555;margin:.25rem 0 1.5rem}
article{break-inside:avoid-page;border-top:1px solid #ccc;padding-top:.75rem;margin-top:1rem}
h2{font-size:12pt;display:flex;justify-content:space-between;gap:1rem;margin:0 0 .5rem}h2 span{color:#555;font-weight:400}
h4{font-size:11pt;margin:.75rem 0 .25rem}p{margin:.25rem 0;white-space:pre-wrap}img{max-width:100%;max-height:14cm;border-radius:6px;margin:.5rem 0}.mood{color:#555;font-style:italic}
</style></head><body><h1>${escape_html(input.title)}</h1><p class="range">${escape_html(input.from)} to ${escape_html(input.to)}</p>${days}</body></html>`;
}

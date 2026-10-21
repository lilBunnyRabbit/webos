export interface DocxHtml {
  html: string;
  left_out: string[];
}

const STYLE_MAP = [
  "u => u",
  "br[type='page'] => hr.page-break",
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
];

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function left_out(html: string, pictures: number, warnings: number): string[] {
  const notes: string[] = [];
  if (pictures) notes.push(plural(pictures, "picture", "pictures"));
  const tables = html.match(/<table[\s>]/g)?.length ?? 0;
  if (tables) notes.push(`${plural(tables, "table", "tables")} (the text is kept)`);
  if (warnings) notes.push(plural(warnings, "unsupported style", "unsupported styles"));
  return notes;
}

export async function docx_to_html(data: ArrayBuffer): Promise<DocxHtml> {
  const { default: mammoth } = await import("mammoth");
  let pictures = 0;
  const result = await mammoth.convertToHtml(
    { arrayBuffer: data },
    {
      styleMap: STYLE_MAP,
      convertImage: mammoth.images.imgElement(async () => {
        pictures++;
        return { src: "" };
      }),
    }
  );
  const warnings = result.messages.filter((message) => message.type === "warning").length;
  return { html: result.value, left_out: left_out(result.value, pictures, warnings) };
}

import { picture_data_url } from "$kit/utils/picture";
import { PICTURE } from "./model";

export interface DocxHtml {
  html: string;
  left_out: string[];
}

const STYLE_MAP = [
  "u => u",
  "br[type='page'] => hr.page-break",
  "p[style-name='Title'] => p.title:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
];

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** `pictures` counts the ones that couldn't be read. */
export function left_out(pictures: number, warnings: number): string[] {
  const notes: string[] = [];
  if (pictures) notes.push(plural(pictures, "picture", "pictures"));
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
      // Pictures come in downscaled like pasted ones; one the browser can't decode (EMF, WMF) is left out.
      convertImage: mammoth.images.imgElement(async (image) => {
        try {
          return { src: await picture_data_url(new Blob([await image.readAsArrayBuffer()], { type: image.contentType }), PICTURE) };
        } catch {
          pictures++;
          return { src: "" };
        }
      }),
    }
  );
  const warnings = result.messages.filter((message) => message.type === "warning").length;
  return { html: result.value, left_out: left_out(pictures, warnings) };
}

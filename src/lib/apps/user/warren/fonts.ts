import { descriptors_of, type FaceSource } from "$lib/core/utils/font-loader";

export function to_base64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export function font_format(bytes: Uint8Array): { mime: string; format: string } {
  const tag = String.fromCharCode(...bytes.subarray(0, 4));
  if (tag === "wOF2") return { mime: "font/woff2", format: "woff2" };
  if (tag === "wOFF") return { mime: "font/woff", format: "woff" };
  if (tag === "OTTO") return { mime: "font/otf", format: "opentype" };
  return { mime: "font/ttf", format: "truetype" };
}

// The print page is a sandboxed document with only `data:` fonts allowed, so every face travels inline.
export function face_css(family: string, sources: readonly FaceSource[]): string {
  return sources
    .map((source) => {
      const { mime, format } = font_format(source.bytes);
      const descriptors = source.descriptors ?? descriptors_of(source.bytes);
      return (
        `@font-face{font-family:"${family}";src:url(data:${mime};base64,${to_base64(source.bytes)}) format("${format}")` +
        `${descriptors.weight ? `;font-weight:${descriptors.weight}` : ""}${descriptors.style ? `;font-style:${descriptors.style}` : ""}}`
      );
    })
    .join("");
}

import { file_stem } from "$lib/core/api/services/files/path";
export function child_path(folder: string, name: string): string {
  return `${folder === "/" ? "" : folder}/${name}`;
}

export function with_extension(name: string, extension: string): string {
  return `${file_stem(name)}.${extension}`;
}

export function signed_name(name: string): string {
  return `${file_stem(name)} (signed).pdf`;
}

export function merged_name(names: string[]): string {
  if (names.length === 0) return "Merged.pdf";
  return `${file_stem(names[0])} (merged).pdf`;
}

export function describe_pages(pages: number[]): string {
  if (pages.length === 0) return "";
  const parts: string[] = [];
  let start = pages[0];
  let previous = pages[0];
  for (const page of [...pages.slice(1), Number.NaN]) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    parts.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = previous = page;
  }
  return parts.join(", ");
}

export function part_name(name: string, pages: number[]): string {
  const label = describe_pages(pages).replaceAll(", ", ",");
  return `${file_stem(name)} (${pages.length === 1 ? "page" : "pages"} ${label}).pdf`;
}

// Zero-padded so the files sort in page order.
export function page_image_name(name: string, page: number, count: number, extension: string): string {
  const width = String(count).length;
  return `${file_stem(name)} - page ${String(page).padStart(width, "0")}.${extension}`;
}

export function images_pdf_name(names: string[]): string {
  if (names.length === 0) return "Images.pdf";
  return names.length === 1
    ? with_extension(names[0], "pdf")
    : `${file_stem(names[0])} and ${names.length - 1} more.pdf`;
}

export function signature_file_name(name: string): string {
  const clean = name.trim().replace(/[\\/:*?"<>|]/g, "-") || "Signature";
  return clean.toLowerCase().endsWith(".svg") ? clean : `${clean}.svg`;
}

export function is_pdf_name(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

export function is_image_name(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(name);
}

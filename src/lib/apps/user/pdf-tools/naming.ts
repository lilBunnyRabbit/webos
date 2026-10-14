export function base_name(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function parent_path(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

export function join_path(folder: string, name: string): string {
  return `${folder === "/" ? "" : folder}/${name}`;
}

export function stem(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(0, index) : name;
}

export function with_extension(name: string, extension: string): string {
  return `${stem(name)}.${extension}`;
}

export function signed_name(name: string): string {
  return `${stem(name)} (signed).pdf`;
}

export function merged_name(names: string[]): string {
  if (names.length === 0) return "Merged.pdf";
  return `${stem(names[0])} (merged).pdf`;
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
  return `${stem(name)} (${pages.length === 1 ? "page" : "pages"} ${label}).pdf`;
}

// Zero-padded so the files sort in page order.
export function page_image_name(name: string, page: number, count: number, extension: string): string {
  const width = String(count).length;
  return `${stem(name)} - page ${String(page).padStart(width, "0")}.${extension}`;
}

export function images_pdf_name(names: string[]): string {
  if (names.length === 0) return "Images.pdf";
  return names.length === 1 ? with_extension(names[0], "pdf") : `${stem(names[0])} and ${names.length - 1} more.pdf`;
}

export function signature_file_name(name: string): string {
  const clean = name.trim().replace(/[\\/:*?"<>|]/g, "-") || "Signature";
  return clean.toLowerCase().endsWith(".svg") ? clean : `${clean}.svg`;
}

export function is_pdf_name(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

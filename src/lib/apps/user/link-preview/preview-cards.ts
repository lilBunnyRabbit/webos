import type { PageMeta } from "./parse";

export interface CardProps {
  meta: PageMeta;
}

export function display_host(meta: PageMeta): string {
  return meta.host ?? "no base URL";
}

export function wants_large_image(meta: PageMeta): boolean {
  return meta.derived.card === "summary_large_image" || (meta.derived.image_width ?? 0) >= 600;
}

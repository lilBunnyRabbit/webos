export const ImageFormat = { PNG: "image/png", JPEG: "image/jpeg", WEBP: "image/webp" } as const;
export type ImageFormat = (typeof ImageFormat)[keyof typeof ImageFormat];

export const FORMAT_OPTIONS: { value: ImageFormat; label: string }[] = [
  { value: ImageFormat.PNG, label: "PNG" },
  { value: ImageFormat.JPEG, label: "JPEG" },
  { value: ImageFormat.WEBP, label: "WebP" },
];

export const IMAGE_EXTENSIONS: Readonly<Record<string, ImageFormat>> = {
  ".png": ImageFormat.PNG,
  ".jpg": ImageFormat.JPEG,
  ".jpeg": ImageFormat.JPEG,
  ".webp": ImageFormat.WEBP,
};

export const DEFAULT_QUALITY = 0.92;

export function extension_for(format: ImageFormat): string {
  return format === ImageFormat.JPEG ? ".jpg" : format === ImageFormat.WEBP ? ".webp" : ".png";
}

export function format_of(name: string): ImageFormat | null {
  const slash = name.lastIndexOf("/");
  const dot = name.lastIndexOf(".");
  return (dot > slash + 1 && IMAGE_EXTENSIONS[name.slice(dot).toLowerCase()]) || null;
}

/** The format the saved name asks for, so `x.webp` is WebP even if PNG was selected. */
export function format_for_name(name: string, fallback: ImageFormat = ImageFormat.PNG): ImageFormat {
  return format_of(name) ?? fallback;
}

export function has_quality(format: ImageFormat): boolean {
  return format !== ImageFormat.PNG;
}

/** JPEG has no alpha; without a backdrop transparent pixels encode as black. */
export function needs_backdrop(format: ImageFormat): boolean {
  return format === ImageFormat.JPEG;
}

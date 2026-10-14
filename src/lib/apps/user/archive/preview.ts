export const PreviewKind = {
  TEXT: "text",
  IMAGE: "image",
  NONE: "none",
} as const;
export type PreviewKind = (typeof PreviewKind)[keyof typeof PreviewKind];

export const PREVIEW_LIMIT = 4 * 1024 * 1024;
export const TEXT_PREVIEW_CHARS = 100_000;

const IMAGES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

const TEXT = new Set(
  "txt md markdown json jsonc js mjs cjs ts tsx jsx css scss html htm xml csv tsv yml yaml toml ini cfg conf log sh bash zsh py rb go rs java kt c h cpp hpp cs php sql svelte vue env gitignore gitattributes editorconfig license readme makefile dockerfile".split(" ")
);

function extension(name: string): string {
  const base = name.slice(name.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1) : base;
}

export function preview_kind(name: string): PreviewKind {
  const ext = extension(name);
  if (ext in IMAGES) return PreviewKind.IMAGE;
  if (TEXT.has(ext)) return PreviewKind.TEXT;
  return PreviewKind.NONE;
}

export function image_type(name: string): string {
  return IMAGES[extension(name)] ?? "application/octet-stream";
}

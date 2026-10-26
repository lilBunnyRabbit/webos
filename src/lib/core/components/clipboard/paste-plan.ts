import { association_tier } from "$lib/core/api/services/apps/associations";

export const PasteFrom = {
  EVENT: "event",
  WEBOS: "webos",
  TEXT: "text",
  NONE: "none",
} as const;
export type PasteFrom = (typeof PasteFrom)[keyof typeof PasteFrom];

export function accepts_file(accept: string[] | undefined, file: { name: string; type: string }): boolean {
  if (!accept?.length) return true;
  return accept.some((entry) => association_tier(entry, file) > 0);
}

// Copying in WebOS writes the paths as text too, so text that still matches means nothing newer was copied since.
export function same_paths(text: string, paths: string[]): boolean {
  return paths.length > 0 && text.replace(/\r\n?/g, "\n").trim() === paths.join("\n");
}

export interface PasteInput {
  files: number;
  accepted: number;
  text: string;
  paths: string[];
  editable: boolean;
}

export function plan_paste({ files, accepted, text, paths, editable }: PasteInput): PasteFrom {
  if (accepted > 0) return PasteFrom.EVENT;
  // A field keeps its text paste; an empty system clipboard leaves the WebOS copy as the newest thing copied.
  if (!editable && paths.length > 0 && (same_paths(text, paths) || (!text && files === 0))) return PasteFrom.WEBOS;
  if (text) return PasteFrom.TEXT;
  return PasteFrom.NONE;
}

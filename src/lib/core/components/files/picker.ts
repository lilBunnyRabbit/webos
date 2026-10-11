import { association_tier } from "$lib/core/api";
import type { FileSystemItem } from "$lib/core/api/services/files";

/** File Explorer in picker mode (ADR-025): a window sheet that returns a path instead of opening things. */
export interface PickerMode {
  kind: "file" | "directory";
  /** Extensions (".md") or MIME patterns ("image/*"), the same syntax as app associations. Empty = anything. */
  accept?: string[];
  onchoose: (path: string) => void;
  oncancel: () => void;
}

export function accepts(picker: PickerMode, item: FileSystemItem): boolean {
  if (item.kind === "directory") return picker.kind === "directory";
  if (picker.kind === "directory") return false;
  if (!picker.accept?.length) return true;
  return picker.accept.some((entry) => association_tier(entry, { name: item.name, type: item.type ?? "" }) > 0);
}

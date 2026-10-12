import type { IService } from "../../type";

import type { ConflictChoice } from "../files/type";

export type { ConflictChoice };
export type ClipboardMode = "copy" | "cut";

export interface FilesClipboard {
  kind: "files";
  mode: ClipboardMode;
  /** Absolute paths. */
  paths: string[];
}

/**
 * The OS clipboard (ADR-025). Files stay inside WebOS (the browser clipboard can't hold OPFS entries) and are lost on
 * reload; text goes to the system clipboard.
 */
export interface ClipboardService extends IService {
  readonly content: FilesClipboard | null;

  copy_files(paths: string[]): void;
  cut_files(paths: string[]): void;
  /** `true` if `path` is waiting to be moved by a paste (shown dimmed). */
  is_cut(path: string): boolean;
  clear(): void;

  /**
   * Copies or moves the clipboard's entries into the folder at `target`. `on_conflict` decides what happens when a name
   * is taken there; the caller shows the question (a window sheet or a system dialog). After a cut, the clipboard
   * empties. Resolves with the new paths.
   */
  paste_files(target: string, on_conflict: (name: string) => Promise<ConflictChoice>): Promise<string[]>;

  copy_text(text: string): Promise<void>;
}

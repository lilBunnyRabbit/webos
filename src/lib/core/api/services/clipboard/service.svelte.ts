import type { FilesService, Kernel } from "$lib/core/api";
import type { ClipboardMode, ClipboardService as IClipboardService, ConflictChoice, FilesClipboard } from "./type";
import { clipboard_shell } from "./shell";

export class ClipboardService implements IClipboardService {
  name = "ClipboardService";
  description = "Copy, cut and paste for files; text to the system clipboard";
  inspector = () => import("./inspector.svelte");
  shell = () => clipboard_shell(this);

  to_string(): string {
    return `ClipboardService: ${this.content ? `${this.content.mode} ${this.content.paths.length}` : "empty"}`;
  }

  public content = $state<FilesClipboard | null>(null);

  private files_service!: FilesService;

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
  }

  copy_files(paths: string[]): void {
    this.set("copy", paths);
  }

  cut_files(paths: string[]): void {
    this.set("cut", paths);
  }

  is_cut(path: string): boolean {
    return this.content?.mode === "cut" && this.content.paths.includes(path);
  }

  clear(): void {
    this.content = null;
  }

  private set(mode: ClipboardMode, paths: string[]): void {
    this.content = paths.length > 0 ? { kind: "files", mode, paths: [...paths] } : null;
  }

  async paste_files(target: string, on_conflict: (name: string) => Promise<ConflictChoice>): Promise<string[]> {
    const content = this.content;
    if (!content) return [];

    const pasted =
      content.mode === "copy"
        ? await this.files_service.copy_paths(content.paths, target, on_conflict)
        : await this.files_service.move_paths(content.paths, target, on_conflict);

    if (content.mode === "cut") this.content = null;
    return pasted;
  }

  async copy_text(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
  }
}

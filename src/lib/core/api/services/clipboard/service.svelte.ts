import type { FilesService, Kernel } from "$lib/core/api";
import { join_path, split_path } from "../files/path";
import type { ClipboardMode, ClipboardService as IClipboardService, ConflictChoice, FilesClipboard } from "./type";

export class ClipboardService implements IClipboardService {
  name = "ClipboardService";
  description = "Copy, cut and paste for files; text to the system clipboard";
  inspector = () => import("./inspector.svelte");

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

    const target_dir = await this.files_service.get_directory(target);
    if (!target_dir) throw new Error(`${target} doesn't exist`);

    const pasted: string[] = [];
    for (const path of content.paths) {
      const segments = split_path(path);
      const name = segments.at(-1)!;
      const parent_path = join_path(segments.slice(0, -1));
      const parent = await this.files_service.get_directory(parent_path);
      if (!parent) continue;

      const directory = await this.files_service.get_directory(path);
      if (directory && (target === path || target.startsWith(`${path}/`))) {
        throw new Error(`Can't paste "${name}" into itself`);
      }

      const same_folder = parent_path === join_path(split_path(target));
      // Cutting and pasting back into the same folder is a no-op, not a conflict with itself.
      if (content.mode === "cut" && same_folder) {
        pasted.push(path);
        continue;
      }

      let new_name = name;
      // Copying into its own folder always keeps both: "Replace" would delete the very thing being copied.
      if (!same_folder && (await this.files_service.exists(target_dir, name))) {
        const choice = await on_conflict(name);
        if (choice === "skip") continue;
        if (choice === "replace") await this.files_service.delete_entry(target_dir, name, { recursive: true });
        // keep_both: the copy/move below auto-renames ("name (1).ext").
      }

      if (directory) {
        const result =
          content.mode === "copy"
            ? await this.files_service.copy_directory(directory, target_dir, new_name)
            : await this.files_service.move_directory(parent, directory, target_dir, new_name);
        new_name = result.name;
      } else {
        const file = await parent.getFileHandle(name).catch(() => null);
        if (!file) continue;
        const result =
          content.mode === "copy"
            ? await this.files_service.copy_file(file, target_dir, new_name)
            : await this.files_service.move_file(parent, file, target_dir, new_name);
        new_name = result.name;
      }
      pasted.push(join_path(split_path(target), new_name));
    }

    if (content.mode === "cut") this.content = null;
    return pasted;
  }

  async copy_text(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
  }
}

import type { FilesService } from "$lib/core/api";
import { is_system_path } from "$lib/core/api/services/files/hierarchy";
import { language_for } from "$lib/core/components/code";
import { base_name, parent_path } from "$lib/core/api/services/files/path";

export class DiffSide {
  text = $state.raw("");
  saved = $state.raw("");
  path = $state<string | null>(null);
  label = $state<string | null>(null);
  /** `lastModified` of the version on disk the text is based on. */
  base_modified = 0;
  saving = false;

  readonly name = $derived(this.path ? base_name(this.path) : this.label);
  readonly dirty = $derived(this.path !== null && this.text !== this.saved);
  /** OS files (/etc, /var, /tmp) are compared, never written. */
  readonly read_only = $derived(this.path !== null && is_system_path(this.path));
  readonly language = $derived(language_for(this.name ?? ""));
  readonly empty = $derived(this.text === "" && this.path === null && this.label === null);

  constructor(private readonly files: () => FilesService) {}

  async load(path: string): Promise<boolean> {
    const file = await this.files().get_file(path);
    if (!file) return false;
    const content = await file.text();
    this.path = path;
    this.label = null;
    this.base_modified = file.lastModified;
    this.text = this.saved = content;
    return true;
  }

  set_text(text: string, label: string) {
    this.path = null;
    this.label = label;
    this.base_modified = 0;
    this.text = this.saved = text;
  }

  /** Picks up a save made elsewhere. `true` when the text was replaced; unsaved edits are never replaced. */
  async refresh(): Promise<boolean> {
    const target = this.path;
    if (!target || this.saving || this.dirty) return false;
    const file = await this.files().get_file(target);
    if (!file || target !== this.path || this.dirty || file.lastModified <= this.base_modified) return false;
    const content = await file.text();
    if (target !== this.path || this.dirty) return false;
    this.base_modified = file.lastModified;
    if (content === this.text) return false;
    this.text = this.saved = content;
    return true;
  }

  async save(confirm_overwrite: () => Promise<boolean>): Promise<boolean> {
    const target = this.path;
    if (!target || this.read_only) return false;
    this.saving = true;
    try {
      const disk = await this.files().get_file(target);
      if (disk && disk.lastModified > this.base_modified && (await disk.text()) !== this.text) {
        if (!(await confirm_overwrite())) return false;
      }
      const directory = await this.files().get_directory(parent_path(target));
      if (!directory) throw new Error(`Folder not found: ${parent_path(target)}`);
      const content = this.text;
      await this.files().create_file(directory, base_name(target), { content, overwrite: true });
      this.base_modified = (await this.files().get_file(target))?.lastModified ?? Date.now();
      this.saved = content;
      return true;
    } finally {
      this.saving = false;
    }
  }

  swap_with(other: DiffSide) {
    [this.text, other.text] = [other.text, this.text];
    [this.saved, other.saved] = [other.saved, this.saved];
    [this.path, other.path] = [other.path, this.path];
    [this.label, other.label] = [other.label, this.label];
    [this.base_modified, other.base_modified] = [other.base_modified, this.base_modified];
  }
}

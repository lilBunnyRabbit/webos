import type { WindowId, WindowInstance } from "./type";

/** The answer to "Save changes?" (ADR-029). */
export const CloseChoice = {
  SAVE: "save",
  DISCARD: "discard",
  CANCEL: "cancel",
} as const;
export type CloseChoice = (typeof CloseChoice)[keyof typeof CloseChoice];

export interface CloseRequest {
  id: WindowId;
  /** What the sheet names: the window's title, or its app's name. */
  title: string;
  /** Whether the app gave a `save`; without one the sheet offers only Don't save and Cancel. */
  can_save: boolean;
}

export type ClosePrompt = (request: CloseRequest) => Promise<CloseChoice>;

export interface DirtyOptions {
  /** Saves the document. Resolves `true` once saved; `false` keeps the window open. */
  save?: () => Promise<boolean>;
}

/**
 * The part of a guarded close both window services share (ADR-029). The prompt is registered by DialogsService, which
 * depends on windows, not the other way round. Without one, a dirty window refuses to close rather than lose work.
 */
export class CloseGuard {
  private prompt: ClosePrompt | null = null;
  /** Plain, not reactive: only read while closing. */
  private saves = new Map<WindowId, () => Promise<boolean>>();
  private asking = new Set<WindowId>();

  set_prompt(prompt: ClosePrompt): () => void {
    this.prompt = prompt;
    return () => {
      if (this.prompt === prompt) this.prompt = null;
    };
  }

  set_save(id: WindowId, save: (() => Promise<boolean>) | undefined): void {
    if (save) this.saves.set(id, save);
    else this.saves.delete(id);
  }

  forget(id: WindowId): void {
    this.saves.delete(id);
    this.asking.delete(id);
  }

  clear(): void {
    this.saves.clear();
    this.asking.clear();
  }

  /** `true` when the window may close: it's clean, or the user chose Don't save, or Save succeeded. */
  async allow(instance: WindowInstance, bring_forward: () => void): Promise<boolean> {
    if (!instance.dirty) return true;
    // A second click on × while the sheet is up doesn't stack another sheet.
    if (!this.prompt || this.asking.has(instance.id)) return false;

    this.asking.add(instance.id);
    try {
      bring_forward();
      const save = this.saves.get(instance.id);
      const choice = await this.prompt({ id: instance.id, title: instance.title ?? instance.app.manifest.name, can_save: !!save });
      if (choice === CloseChoice.CANCEL) return false;
      if (choice === CloseChoice.SAVE) return (await save?.()) ?? false;
      return true;
    } finally {
      this.asking.delete(instance.id);
    }
  }
}

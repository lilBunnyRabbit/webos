import type { Attachment } from "svelte/attachments";
import kernel, { type ClipboardService, type DialogsService, type FilesService, type WindowId, type WindowsService } from "$lib/core/api";
import { accepts_file, PasteFrom, plan_paste, same_paths } from "./paste-plan";

export { accepts_file, PasteFrom, same_paths };

/** A file on the clipboard; `path` is set when it was copied in WebOS. */
export interface PasteFile {
  kind: "file";
  file: File;
  path: string | null;
}

export interface PasteText {
  kind: "text";
  text: string;
}

export type PasteItem = PasteFile | PasteText;

export interface PasteOptions {
  accept?: string[];
  multiple?: boolean;
}

const clipboard = () => kernel.service<ClipboardService>("clipboard");

const view = async () => (await import("./clipboard-view.svelte")).default;

// `instanceof Element` fails for nodes of a popped-out window's document, which is another realm.
export function is_editable(target: EventTarget | null): boolean {
  const element = target as Element | null;
  return element?.nodeType === 1 && element.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}

/**
 * Whether a paste belongs to the window `root` is in. A focused window holds the keyboard on its frame, outside the
 * app's root, so the frame is the scope; a popped-out window's document is all one window.
 */
export function in_window(root: HTMLElement, target: EventTarget | null): boolean {
  const document = root.ownerDocument;
  const node = target as Node | null;
  if (!node || node === document.body || node === document.documentElement) return true;
  return (root.closest("[data-window-id]") ?? document.body).contains(node);
}

/**
 * Ctrl+V for a window sheet (the picker, the clipboard view) while it's the top one. On the document, not the sheet:
 * focus can sit on the sheet's wrapper or the window frame, outside the sheet's own element.
 */
export function sheet_paste(window_id: WindowId, handler: (event: ClipboardEvent) => void): Attachment<HTMLElement> {
  return (root) => {
    const document = root.ownerDocument;
    const on_paste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || !kernel.service<WindowsService>("windows").is_focused(window_id)) return;
      if (root.closest("[inert]") || kernel.service<DialogsService>("dialogs").system.length > 0) return;
      if (in_window(root, event.target)) handler(event);
    };
    document.addEventListener("paste", on_paste);
    return () => document.removeEventListener("paste", on_paste);
  };
}

export async function webos_files(paths: string[]): Promise<PasteFile[]> {
  const files = kernel.service<FilesService>("files");
  const loaded = await Promise.all(
    paths.map(async (path): Promise<PasteFile | null> => {
      const file = await files.get_file(path).catch(() => null);
      return file ? { kind: "file", file, path } : null;
    })
  );
  return loaded.filter((item) => item !== null);
}

export interface PasteRead {
  from: PasteFrom;
  text: string;
  editable: boolean;
  files(): Promise<PasteFile[]>;
}

/** Reads a paste event synchronously, so the caller can still `preventDefault()` when it's files. */
export function read_paste(event: ClipboardEvent, accept?: string[]): PasteRead {
  const data = event.clipboardData;
  const files = Array.from(data?.files ?? []);
  const text = data?.getData("text/plain") ?? "";
  const paths = clipboard().content?.paths ?? [];
  const editable = is_editable(event.target);
  const accepted = files.filter((file) => accepts_file(accept, file));
  const from = plan_paste({ files: files.length, accepted: accepted.length, text, paths, editable });

  return {
    from,
    text,
    editable,
    async files() {
      if (from === PasteFrom.EVENT) return accepted.map((file) => ({ kind: "file", file, path: null }));
      if (from === PasteFrom.WEBOS) return (await webos_files(paths)).filter((item) => accepts_file(accept, item.file));
      return [];
    },
  };
}

/** One usable file, or a caller that takes several, goes straight through; otherwise the clipboard view asks which. */
export async function settle(window_id: WindowId, items: PasteFile[], options: PasteOptions): Promise<PasteFile[]> {
  const usable = items.filter((item) => accepts_file(options.accept, item.file));
  if (usable.length <= 1 || options.multiple) return usable;
  return (await show_clipboard(window_id, usable, true, options)) ?? [];
}

function image_name(type: string): string {
  const subtype = type.slice("image/".length).replace("+xml", "").replace("jpeg", "jpg");
  return `image.${subtype || "png"}`;
}

/** The system clipboard's current item through the async Clipboard API; `null` when the browser or the user refuses. */
export async function read_system(): Promise<PasteItem[] | null> {
  try {
    const items: PasteItem[] = [];
    for (const entry of await navigator.clipboard.read()) {
      const image = entry.types.find((type) => type.startsWith("image/"));
      if (image) {
        const blob = await entry.getType(image);
        items.push({ kind: "file", file: new File([blob], image_name(image), { type: image }), path: null });
      } else if (entry.types.includes("text/plain")) {
        const text = await (await entry.getType("text/plain")).text();
        if (text.trim()) items.push({ kind: "text", text });
      }
    }
    return items;
  } catch {
    return null;
  }
}

/** Everything on the clipboard now, newest first: the system item (unless it's WebOS's own paths), then WebOS's files. */
export async function clipboard_items(system: PasteItem[] | null): Promise<PasteItem[]> {
  const paths = clipboard().content?.paths ?? [];
  const webos = await webos_files(paths);
  const text = system?.find((item) => item.kind === "text")?.text ?? "";
  return [...(system && !same_paths(text, paths) ? system : []), ...webos];
}

export async function show_clipboard(
  window_id: WindowId,
  items: PasteItem[],
  readable: boolean,
  options: PasteOptions
): Promise<PasteFile[] | null> {
  const dialogs = kernel.service<DialogsService>("dialogs");
  return dialogs.show(
    await view(),
    { window_id, items, readable, accept: options.accept, multiple: options.multiple ?? false },
    { window: window_id }
  );
}

/** The Paste button: reads the system clipboard (the click is the user gesture it needs) and shows the view. */
export async function choose_from_clipboard(window_id: WindowId, options: PasteOptions): Promise<PasteFile[] | null> {
  const system = await read_system();
  return show_clipboard(window_id, await clipboard_items(system), system !== null, options);
}

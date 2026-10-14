<script lang="ts">
  import kernel, {
    NotificationType,
    ShortcutCategory,
    type FilesService,
    type NotificationsService,
    type SettingsService,
    type ShortcutsService,
  } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { Button, CopyButton, EmptyState, IconButton, Segmented, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn, format_bytes } from "$lib/core/utils";
  import { error_message, parent_folder } from "$lib/core/utils/image";
  import { indentWithTab } from "@codemirror/commands";
  import { Compartment, EditorState } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { basicSetup } from "codemirror";
  import {
    FilePlus as FilePlusIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    Devices as DevicesIcon,
    FolderOpen as FolderOpenIcon,
    LockSimple as LockSimpleIcon,
    TextAlignLeft as TextAlignLeftIcon,
    Warning as WarningIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { Language, language_for, load_language, token_highlight, token_theme } from "$lib/core/components/code";
  import { preview_document, render_markdown, SCROLL_MESSAGE } from "./markdown-preview";
  import manifest from "./index";

  const { path: initial_path }: { path?: string } = $props();

  const { app_id, window_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const settings = $derived(kernel.service<SettingsService>("settings"));

  const wrap = storage.window("wrap", true, z.boolean());

  const MarkdownMode = { EDIT: "edit", SPLIT: "split", PREVIEW: "preview" } as const;
  type MarkdownMode = (typeof MarkdownMode)[keyof typeof MarkdownMode];
  const markdown_mode = storage.window<MarkdownMode>("markdown", MarkdownMode.SPLIT, z.enum(["edit", "split", "preview"]));

  const Status = { LOADING: "loading", READY: "ready", MISSING: "missing", ERROR: "error" } as const;
  type Status = (typeof Status)[keyof typeof Status];

  let path = $state<string | null>(untrack(() => initial_path ?? null));
  /** The name of a file opened from the device: it has no path until Save as gives it one. */
  let device_name = $state<string | null>(null);
  let status = $state<Status>(untrack(() => (initial_path ? Status.LOADING : Status.READY)));
  let error = $state("");
  let text = $state.raw("");
  let saved_text = $state.raw("");
  /** `lastModified` of the version on disk this buffer is based on. Newer on disk = changed elsewhere. */
  let base_modified = 0;
  let stale_modified = $state<number | null>(null);
  let saving = false;

  let view = $state.raw<EditorView | null>(null);
  const wrap_slot = new Compartment();
  const language_slot = new Compartment();
  const read_only_slot = new Compartment();

  const dirty = $derived(text !== saved_text);
  /** OS files (/etc, /var, /tmp) are for reading; a change can only be saved as a copy elsewhere. */
  const read_only = $derived(path !== null && is_system_path(path));
  const name = $derived(path ? path.slice(path.lastIndexOf("/") + 1) : (device_name ?? "Untitled"));
  const is_markdown = $derived(language_for(name) === Language.MARKDOWN);
  const mode = $derived(is_markdown ? markdown_mode.value : MarkdownMode.EDIT);

  let preview_html = $state.raw("");
  let preview_frame = $state<HTMLIFrameElement | null>(null);
  let preview_scroll = 0;
  const nonce = crypto.randomUUID();
  const preview_srcdoc = $derived(preview_document(preview_html, settings.theme, untrack(() => preview_scroll), nonce));
  const line_count = $derived(text.split("\n").length);

  function mount(host: HTMLElement) {
    const editor = new EditorView({
      parent: host,
      state: EditorState.create({
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          token_theme,
          token_highlight,
          wrap_slot.of(untrack(() => wrap.value) ? EditorView.lineWrapping : []),
          language_slot.of([]),
          read_only_slot.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) text = update.state.doc.toString();
          }),
        ],
      }),
    });
    view = editor;
    // The attachment is an effect: anything load() reads must not re-run it and rebuild the editor.
    untrack(() => (path ? load(path) : editor.focus()));
    return () => {
      editor.destroy();
      view = null;
    };
  }

  function set_doc(content: string, keep_position: boolean) {
    if (!view) return;
    const { anchor, head } = view.state.selection.main;
    const scroll = view.scrollDOM.scrollTop;
    const length = content.length;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      selection: keep_position ? { anchor: Math.min(anchor, length), head: Math.min(head, length) } : { anchor: 0 },
    });
    if (keep_position) view.scrollDOM.scrollTop = scroll;
    else view.scrollDOM.scrollTop = 0;
    text = content;
  }

  async function set_language(file_name: string) {
    const language = language_for(file_name);
    const support = language ? await load_language(language) : [];
    if (file_name !== name || !view) return;
    view.dispatch({ effects: language_slot.reconfigure(support) });
  }

  async function load(target: string, keep_position = false) {
    if (!keep_position) status = Status.LOADING;
    try {
      const file = await files.get_file(target);
      if (!file) {
        path = target;
        status = Status.MISSING;
        return;
      }
      const content = await file.text();
      path = target;
      base_modified = file.lastModified;
      saved_text = content;
      stale_modified = null;
      set_doc(content, keep_position);
      status = Status.READY;
      set_language(name);
      if (!keep_position) view?.focus();
    } catch (reason) {
      path = target;
      error = error_message(reason);
      status = Status.ERROR;
    }
  }

  async function discard_ok(): Promise<boolean> {
    if (!dirty) return true;
    return win.confirm(`Discard changes to “${name}”?`, {
      detail: "Your unsaved changes will be lost.",
      confirm_label: "Discard",
      danger: true,
    });
  }

  async function new_file() {
    if (!(await discard_ok())) return;
    open_untitled(null, "");
  }

  function open_untitled(file_name: string | null, content: string) {
    path = null;
    device_name = file_name;
    base_modified = 0;
    saved_text = content;
    stale_modified = null;
    set_doc(content, false);
    status = Status.READY;
    set_language(name);
    view?.focus();
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({
      accept: manifest.associations,
      start_path: path ? parent_folder(path) : undefined,
      title: "Open in Text Editor",
    });
    if (chosen) await load(chosen);
  }

  async function open_device() {
    if (!(await discard_ok())) return;
    const [file] = await pick_device_files({ accept: manifest.associations });
    if (!file) return;
    try {
      open_untitled(file.name, await file.text());
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't read the file", message: error_message(reason) });
    }
  }

  async function write(target: string): Promise<boolean> {
    saving = true;
    try {
      if (target === path) {
        const disk = await files.get_file(target);
        if (disk && disk.lastModified > base_modified && (await disk.text()) !== text) {
          const overwrite = await win.confirm(`“${name}” changed on disk`, {
            detail: "Saving replaces the newer version with yours.",
            confirm_label: "Overwrite",
            danger: true,
          });
          if (!overwrite) return false;
        }
      }
      const directory = await files.get_directory(parent_folder(target));
      if (!directory) throw new Error(`Folder not found: ${parent_folder(target)}`);
      const content = text;
      await files.create_file(directory, target.slice(target.lastIndexOf("/") + 1), { content, overwrite: true });
      base_modified = (await files.get_file(target))?.lastModified ?? Date.now();
      saved_text = content;
      stale_modified = null;
      if (target !== path) {
        path = target;
        set_language(name);
      }
      return true;
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't save the file", message: error_message(reason) });
      return false;
    } finally {
      saving = false;
    }
  }

  async function save_as(): Promise<boolean> {
    const target = await win.pick_save({
      name: path ? name : (device_name ?? "Untitled.txt"),
      accept: manifest.associations,
      start_path: path && !read_only ? parent_folder(path) : "/home",
    });
    return target ? write(target) : false;
  }

  function save(): Promise<boolean> {
    return path && !read_only ? write(path) : save_as();
  }

  async function check_disk() {
    const target = path;
    if (!target || saving || status !== Status.READY) return;
    const file = await files.get_file(target);
    if (!file || target !== path || saving || file.lastModified <= base_modified) return;
    const content = await file.text();
    if (target !== path) return;
    if (content === text) {
      base_modified = file.lastModified;
      saved_text = content;
      stale_modified = null;
    } else if (!dirty) {
      saved_text = content;
      base_modified = file.lastModified;
      set_doc(content, true);
    } else {
      stale_modified = file.lastModified;
    }
  }

  function keep_mine() {
    if (stale_modified !== null) base_modified = stale_modified;
    stale_modified = null;
  }

  // A save from anywhere (another window, Explorer) bumps the folder's revision.
  $effect(() => {
    if (!path) return;
    files.revision(parent_folder(path));
    untrack(() => void check_disk());
  });

  $effect(() => {
    if (mode === MarkdownMode.EDIT) return;
    const source = text;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const html = await render_markdown(source);
      if (!cancelled) preview_html = html;
    }, preview_html ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  function on_message(event: MessageEvent) {
    if (event.source !== preview_frame?.contentWindow || event.data?.type !== SCROLL_MESSAGE) return;
    preview_scroll = Number(event.data.y) || 0;
  }

  $effect(() => {
    const on = wrap.value;
    view?.dispatch({ effects: wrap_slot.reconfigure(on ? EditorView.lineWrapping : []) });
  });

  $effect(() => {
    const locked = read_only;
    view?.dispatch({ effects: read_only_slot.reconfigure(locked ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []) });
  });

  $effect(() => win.set_title(name));
  $effect(() => win.set_dirty(dirty, { save }));

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `text-editor.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("open", "mod+o", "Open…", open),
      scoped("save", "mod+s", "Save", save),
      scoped("save-as", "mod+shift+s", "Save as…", save_as),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });
</script>

<svelte:window onmessage={on_message} />

<div class="flex h-full flex-col">
  <Toolbar>
    <IconButton label="New" size="sm" onclick={new_file}><FilePlusIcon weight="bold" /></IconButton>
    <IconButton label="Open…" size="sm" onclick={open}><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Open from device…" size="sm" onclick={open_device}><DevicesIcon weight="bold" /></IconButton>
    <IconButton label="Save" size="sm" disabled={read_only} onclick={save}><FloppyDiskIcon weight="bold" /></IconButton>
    <IconButton label="Save as…" size="sm" onclick={save_as}><FloppyDiskBackIcon weight="bold" /></IconButton>
    <Separator vertical />
    <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80" title={path ?? "Not saved yet"}>{path ?? "Not saved yet"}</span>
    {#if is_markdown}
      <Segmented
        size="sm"
        label="Markdown view"
        bind:value={markdown_mode.value}
        options={[
          { value: MarkdownMode.EDIT, label: "Edit" },
          { value: MarkdownMode.SPLIT, label: "Split" },
          { value: MarkdownMode.PREVIEW, label: "Preview" },
        ]}
      />
    {/if}
    <IconButton label={wrap.value ? "Don't wrap lines" : "Wrap lines"} size="sm" pressed={wrap.value} onclick={() => (wrap.value = !wrap.value)}>
      <TextAlignLeftIcon weight="bold" />
    </IconButton>
    <CopyButton {text} label="Copy all" />
  </Toolbar>

  {#if read_only}
    <div class="flex flex-wrap items-center gap-2 border-b border-foreground/8 bg-info/10 px-3 py-1.5 text-ui">
      <LockSimpleIcon class="size-4 shrink-0 text-info" weight="fill" />
      <span class="min-w-0 flex-1">This is a system file, so it opens read-only. Save as… keeps a copy you can edit.</span>
      <Button size="sm" variant="secondary" onclick={save_as}>Save as…</Button>
    </div>
  {/if}

  {#if stale_modified !== null}
    <div role="alert" class="flex flex-wrap items-center gap-2 border-b border-foreground/8 bg-warning/10 px-3 py-1.5 text-ui">
      <WarningIcon class="size-4 shrink-0 text-warning" weight="fill" />
      <span class="min-w-0 flex-1">This file changed on disk. Reload it, or keep your version and save over it.</span>
      <Button size="sm" variant="secondary" onclick={keep_mine}>Keep mine</Button>
      <Button size="sm" variant="primary" onclick={() => path && load(path, true)}>Reload</Button>
    </div>
  {/if}

  <div class={cn("relative grid min-h-0 flex-1", mode === MarkdownMode.SPLIT && "grid-rows-2 @2xl:grid-cols-2 @2xl:grid-rows-1")}>
    <div class={cn("min-h-0", mode === MarkdownMode.PREVIEW && "hidden")} {@attach mount}></div>
    {#if mode !== MarkdownMode.EDIT}
      <iframe
        bind:this={preview_frame}
        title="Preview of {name}"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        srcdoc={preview_srcdoc}
        class={cn(
          "block size-full min-h-0 border-0 bg-background",
          mode === MarkdownMode.SPLIT && "border-t border-foreground/8 @2xl:border-t-0 @2xl:border-l"
        )}
      ></iframe>
    {/if}
    {#if status !== Status.READY}
      <div class="absolute inset-0 grid bg-background">
        {#if status === Status.LOADING}
          <div class="grid place-items-center"><Spinner label="Reading file" /></div>
        {:else if status === Status.MISSING}
          <EmptyState icon={WarningCircleIcon} tone="error" title="File not found" description={path ?? ""}>
            {#snippet actions()}<Button variant="primary" onclick={open}><FolderOpenIcon weight="bold" /> Open a file…</Button><Button onclick={open_device}><DevicesIcon weight="bold" /> From device…</Button>{/snippet}
          </EmptyState>
        {:else}
          <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't read the file" description={error}>
            {#snippet actions()}<Button variant="primary" onclick={open}><FolderOpenIcon weight="bold" /> Open a file…</Button><Button onclick={open_device}><DevicesIcon weight="bold" /> From device…</Button>{/snippet}
          </EmptyState>
        {/if}
      </div>
    {/if}
  </div>

  <StatusBar>
    <span class="truncate">{name}</span>
    {#if read_only}<span class="shrink-0">Read-only</span>{/if}
    <span class="ml-auto">{line_count} lines</span>
    <span>{text.length} chars</span>
    <span>{format_bytes(new TextEncoder().encode(text).length)}</span>
  </StatusBar>
</div>

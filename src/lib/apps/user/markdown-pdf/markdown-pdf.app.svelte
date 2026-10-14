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
  import { print_html } from "$lib/core/utils/print";
  import { Button, EmptyState, IconButton, Segmented, Select, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn, format_date, error_message } from "$lib/core/utils";
  import { Language, load_language, token_highlight, token_theme } from "$lib/core/components/code";
  import { indentWithTab } from "@codemirror/commands";
  import { Compartment, EditorState } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { basicSetup } from "codemirror";
  import {
    Devices as DevicesIcon,
    FilePdf as FilePdfIcon,
    FilePlus as FilePlusIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    Printer as PrinterIcon,
    Sparkle as SparkleIcon,
    SlidersHorizontal as SlidersHorizontalIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import inter_url from "../../../../assets/fonts/InterVariable.woff2?url";
  import hack_regular_url from "../../../../assets/fonts/hack-regular.woff2?url";
  import hack_bold_url from "../../../../assets/fonts/hack-bold.woff2?url";
  import {
    count_pages,
    DEFAULT_SETTINGS,
    document_css,
    marks_html,
    page_box,
    PAGE_SIZE_LABELS,
    preview_css,
    preview_shell,
    print_document,
    PX_PER_MM,
    SettingsSchema,
    type DocumentMeta,
    type FontUrls,
    with_launch_settings,
  } from "./layout";
  import type { MarkdownPdfProps } from "./props";
  import { render_markdown, toc_html, type Rendered } from "./render";
  import { SAMPLE } from "./sample";
  import SettingsPanel from "./settings-panel.svelte";
  import manifest from "./index";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";

  const { path: initial_path, print, ...launch_settings }: Partial<MarkdownPdfProps> = $props();

  const { app_id, window_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const theme = $derived(kernel.service<SettingsService>("settings").theme);

  const FONTS: FontUrls = { inter: inter_url, hack_regular: hack_regular_url, hack_bold: hack_bold_url };
  const ACCEPT = manifest.tools ?? [".md"];

  const View = { EDIT: "edit", SPLIT: "split", PREVIEW: "preview" } as const;
  type View = (typeof View)[keyof typeof View];
  const VIEW_OPTIONS: { value: View; label: string }[] = [
    { value: View.EDIT, label: "Edit" },
    { value: View.SPLIT, label: "Split" },
    { value: View.PREVIEW, label: "Pages" },
  ];

  const Status = { EMPTY: "empty", LOADING: "loading", READY: "ready", MISSING: "missing", ERROR: "error" } as const;
  type Status = (typeof Status)[keyof typeof Status];

  const settings = storage.persisted("settings", DEFAULT_SETTINGS, SettingsSchema);
  const view = storage.window<View>("view", View.SPLIT, z.enum(View));
  // A restored window gets `false` back, so a launch's settings and print apply once, not on every session restore.
  const fresh = storage.window("fresh", true, z.boolean());
  let print_pending = untrack(() => fresh.value && print === true);
  untrack(() => {
    if (fresh.value) settings.value = with_launch_settings(settings.value, launch_settings);
    fresh.value = false;
  });
  const panel_open = storage.window("panel", false, z.boolean());
  const doc_path = storage.window<string | null>(
    "path",
    untrack(() => initial_path ?? null),
    z.string().nullable()
  );

  let device_name = $state<string | null>(null);
  let status = $state<Status>(untrack(() => (doc_path.value ? Status.LOADING : Status.EMPTY)));
  let error = $state("");
  let text = $state.raw("");
  let saved_text = $state.raw("");
  let base_modified = 0;
  let editor = $state.raw<EditorView | null>(null);
  const language_slot = new Compartment();

  const path = $derived(doc_path.value);
  const dirty = $derived(text !== saved_text);
  const name = $derived(path ? base_name(path) : (device_name ?? "Untitled.md"));
  const stem = $derived(name.replace(/\.(md|markdown)$/i, ""));
  const ready = $derived(status === Status.READY);

  let rendered = $state.raw<Rendered>(render_markdown(""));
  const body = $derived((settings.value.toc ? toc_html(rendered.headings) : "") + rendered.html);
  const meta: DocumentMeta = $derived({ title: rendered.title ?? stem, date: format_date(Date.now()) });
  const box = $derived(page_box(settings.value));

  let frame = $state<HTMLIFrameElement | null>(null);
  let frame_doc = $state.raw<Document | null>(null);
  let pages = $state(1);
  const shell = preview_shell(FONTS);

  function mount(host: HTMLElement) {
    const instance = new EditorView({
      parent: host,
      state: EditorState.create({
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          token_theme,
          token_highlight,
          EditorView.lineWrapping,
          language_slot.of([]),
          EditorView.contentAttributes.of({ "aria-label": "Markdown" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) text = update.state.doc.toString();
          }),
        ],
      }),
    });
    editor = instance;
    void load_language(Language.MARKDOWN).then((support) => {
      if (editor === instance) instance.dispatch({ effects: language_slot.reconfigure(support) });
    });
    untrack(() => {
      if (path) void load(path);
      else set_doc(text);
    });
    return () => {
      instance.destroy();
      editor = null;
    };
  }

  function set_doc(content: string) {
    text = content;
    if (!editor) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: content }, selection: { anchor: 0 } });
    editor.scrollDOM.scrollTop = 0;
  }

  async function load(target: string) {
    status = Status.LOADING;
    try {
      const file = await files.get_file(target);
      doc_path.value = target;
      device_name = null;
      if (!file) {
        status = Status.MISSING;
        return;
      }
      const content = await file.text();
      base_modified = file.lastModified;
      saved_text = content;
      set_doc(content);
      status = Status.READY;
    } catch (reason) {
      doc_path.value = target;
      error = error_message(reason);
      status = Status.ERROR;
    }
  }

  function start(file_name: string | null, content: string) {
    doc_path.value = null;
    device_name = file_name;
    base_modified = 0;
    saved_text = content;
    set_doc(content);
    status = Status.READY;
    editor?.focus();
  }

  async function discard_ok(): Promise<boolean> {
    if (!dirty) return true;
    return win.confirm(`Discard changes to “${name}”?`, {
      detail: "Your unsaved changes will be lost.",
      confirm_label: "Discard",
      danger: true,
    });
  }

  async function new_doc() {
    if (await discard_ok()) start(null, "");
  }

  async function sample() {
    if (await discard_ok()) start(null, SAMPLE);
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({
      accept: ACCEPT,
      start_path: path ? parent_path(path) : undefined,
      title: "Open in Markdown to PDF",
    });
    if (chosen) await load(chosen);
  }

  async function open_device() {
    if (!(await discard_ok())) return;
    const [file] = await pick_device_files({ accept: ACCEPT });
    if (!file) return;
    try {
      start(file.name, await file.text());
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't read the file", message: error_message(reason) });
    }
  }

  async function write(target: string): Promise<boolean> {
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
      const directory = await files.get_directory(parent_path(target));
      if (!directory) throw new Error(`Folder not found: ${parent_path(target)}`);
      const content = text;
      await files.create_file(directory, base_name(target), { content, overwrite: true });
      base_modified = (await files.get_file(target))?.lastModified ?? Date.now();
      saved_text = content;
      doc_path.value = target;
      device_name = null;
      return true;
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't save the file", message: error_message(reason) });
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const target = await win.pick_save({
      name,
      accept: ACCEPT,
      start_path: path && !is_system_path(path) ? parent_path(path) : "/home",
    });
    return target ? write(target) : false;
  }

  function save(): Promise<boolean> {
    return path && !is_system_path(path) ? write(path) : save_as();
  }

  async function export_pdf() {
    if (!ready) return;
    const html = print_document(body, settings.value, meta, FONTS);
    try {
      await print_html(html, { title: stem });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't open the print dialog", message: error_message(reason) });
    }
  }

  $effect(() => {
    if (!print_pending || status !== Status.READY) return;
    print_pending = false;
    untrack(() => {
      rendered = render_markdown(text);
      void export_pdf();
    });
  });

  $effect(() => {
    const source = text;
    const timer = setTimeout(() => (rendered = render_markdown(source)), rendered.html ? 200 : 0);
    return () => clearTimeout(timer);
  });

  function measure() {
    const doc = frame_doc;
    const paper = doc?.querySelector(".paper");
    const flow = doc?.querySelector(".flow");
    if (!paper || !flow) return;
    const scale = paper.getBoundingClientRect().width / (box.width * PX_PER_MM);
    if (!scale) return;
    pages = count_pages(flow.getBoundingClientRect().height / scale / PX_PER_MM, box);
  }

  function on_frame_load() {
    frame_doc = frame?.contentDocument ?? null;
  }

  $effect(() => {
    const style = frame_doc?.getElementById("style");
    if (!style) return;
    style.textContent = document_css(settings.value, "column") + preview_css(settings.value, { desk: theme.background_darker, foreground: theme.foreground });
    measure();
  });

  $effect(() => {
    const content = frame_doc?.getElementById("content");
    if (!content) return;
    content.innerHTML = body;
    measure();
  });

  $effect(() => {
    const flow = frame_doc?.querySelector(".flow");
    if (!flow) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(flow);
    return () => observer.disconnect();
  });

  $effect(() => {
    const marks = frame_doc?.getElementById("marks");
    if (!marks) return;
    marks.innerHTML = marks_html(pages, settings.value, meta);
  });

  // A save from anywhere (another window, Explorer) bumps the folder's revision; a clean buffer follows it.
  $effect(() => {
    if (!path || status !== Status.READY) return;
    files.revision(parent_path(path));
    const target = path;
    untrack(() => {
      if (dirty) return;
      void files.get_file(target).then(async (file) => {
        if (!file || target !== path || dirty || file.lastModified <= base_modified) return;
        const content = await file.text();
        base_modified = file.lastModified;
        saved_text = content;
        if (content !== text) set_doc(content);
      });
    });
  });

  $effect(() => win.set_title(status === Status.EMPTY ? null : name));
  $effect(() => win.set_dirty(dirty, { save }));

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `markdown-pdf.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("open", "mod+o", "Open…", open),
      scoped("save", "mod+s", "Save", save),
      scoped("save-as", "mod+shift+s", "Save as…", save_as),
      scoped("export", "mod+p", "Export PDF", export_pdf),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });
</script>

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <IconButton label="New" size="sm" onclick={new_doc}><FilePlusIcon weight="bold" /></IconButton>
    <IconButton label="Open…" size="sm" onclick={open}><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Open from device…" size="sm" onclick={open_device}><DevicesIcon weight="bold" /></IconButton>
    <IconButton label="Save" size="sm" disabled={!ready} onclick={save}><FloppyDiskIcon weight="bold" /></IconButton>
    <IconButton label="Save as…" size="sm" disabled={!ready} onclick={save_as}><FloppyDiskBackIcon weight="bold" /></IconButton>
    <Separator vertical class="hidden @md:block" />
    <span class="hidden min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80 @2xl:block" title={path ?? "Not saved yet"}>
      {ready ? (path ?? "Not saved yet") : ""}
    </span>
    <Segmented size="sm" label="View" bind:value={view.value} options={VIEW_OPTIONS} class="ml-auto hidden @md:inline-flex" />
    <Select size="sm" aria-label="View" bind:value={view.value} options={VIEW_OPTIONS} class="ml-auto w-20 @md:hidden" />
    <IconButton label="Page settings" size="sm" pressed={panel_open.value} onclick={() => (panel_open.value = !panel_open.value)}>
      <SlidersHorizontalIcon weight="bold" />
    </IconButton>
    <Button size="sm" variant="primary" disabled={!ready} aria-label="Export PDF" title="Export PDF" onclick={export_pdf}>
      <PrinterIcon weight="bold" /><span class="hidden @md:inline">Export PDF</span>
    </Button>
  </Toolbar>

  <div class="relative flex min-h-0">
    <div
      class={cn(
        "grid min-h-0 min-w-0 flex-1",
        view.value === View.SPLIT && "grid-rows-2 @2xl:grid-cols-2 @2xl:grid-rows-1"
      )}
    >
      <div class={cn("min-h-0 min-w-0", view.value === View.PREVIEW && "hidden")} {@attach mount}></div>
      <iframe
        bind:this={frame}
        title="Pages of {name}"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcdoc={shell}
        onload={on_frame_load}
        class={cn(
          "block size-full min-h-0 border-0 bg-background-darker",
          view.value === View.EDIT && "hidden",
          view.value === View.SPLIT && "border-t border-foreground/8 @2xl:border-t-0 @2xl:border-l"
        )}
      ></iframe>
    </div>

    {#if panel_open.value}
      <SettingsPanel bind:settings={settings.value} onclose={() => (panel_open.value = false)} />
    {/if}

    {#if status !== Status.READY}
      <div class="absolute inset-0 z-20 grid bg-background">
        {#if status === Status.EMPTY}
          <EmptyState icon={FilePdfIcon} title="Turn Markdown into a PDF" description="Open a Markdown file or start writing. Pages show as they'll print.">
            {#snippet actions()}
              <div class="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onclick={open}><FolderOpenIcon weight="bold" /> Open a file…</Button>
                <Button onclick={open_device}><DevicesIcon weight="bold" /> From device…</Button>
                <Button onclick={new_doc}><FilePlusIcon weight="bold" /> Blank</Button>
                <Button variant="quiet" onclick={sample}><SparkleIcon weight="bold" /> Sample</Button>
              </div>
            {/snippet}
          </EmptyState>
        {:else if status === Status.LOADING}
          <div class="grid place-items-center"><Spinner label="Reading file" /></div>
        {:else}
          <EmptyState
            icon={WarningCircleIcon}
            tone="error"
            title={status === Status.MISSING ? "File not found" : "Couldn't read the file"}
            description={status === Status.MISSING ? (path ?? "") : error}
          >
            {#snippet actions()}
              <Button variant="primary" onclick={open}><FolderOpenIcon weight="bold" /> Open a file…</Button>
              <Button onclick={open_device}><DevicesIcon weight="bold" /> From device…</Button>
            {/snippet}
          </EmptyState>
        {/if}
      </div>
    {/if}
  </div>

  <StatusBar>
    <span class="truncate">{ready ? name : "No document"}</span>
    {#if ready}
      <span class="ml-auto shrink-0">{pages} {pages === 1 ? "page" : "pages"}</span>
      <span class="shrink-0">{rendered.words} words</span>
      <span class="hidden shrink-0 @md:inline">{PAGE_SIZE_LABELS[settings.value.page_size]} {settings.value.orientation}</span>
    {/if}
  </StatusBar>
</div>

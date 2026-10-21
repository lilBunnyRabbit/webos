<script lang="ts">
  import kernel, { NotificationType, Platform, ShortcutCategory, type DialogsService, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import { BRAND_LIGHT } from "$lib/core/api/services/settings/themes";
  import { Button, IconButton, Select, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { error_message } from "$lib/core/utils";
  import { print_html } from "$lib/core/utils/print";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    CaretDown as CaretDownIcon,
    DotsThree as DotsThreeIcon,
    FileDoc as FileDocIcon,
    FilePdf as FilePdfIcon,
    FilePlus as FilePlusIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    ListBullets as ListBulletsIcon,
    ListNumbers as ListNumbersIcon,
    TextB as TextBIcon,
    TextItalic as TextItalicIcon,
  } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import { z } from "zod";
  import inter_url from "../../../../assets/fonts/InterVariable.woff2?url";
  import { build_docx, DOCX_TYPE } from "./docx";
  import { BlockStyle, WarrenEditor } from "./editor.svelte";
  import { EXTENSION, serialize_document } from "./format";
  import { document_file_name, read_document, stem_of, with_extension, write_file } from "./io";
  import { document_text } from "./model";
  import { Flow, PAGE_MM } from "./page";
  import { document_css, print_document } from "./print";
  import { fill_sheets } from "./sheets";
  import WarrenTools from "./warren-tools.svelte";
  import { count, repeated_words } from "./words";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const groups = storage.persisted<Record<string, boolean>>("groups", {}, z.record(z.string(), z.boolean()));
  const mobile = kernel.platform === Platform.MOBILE;

  const editor = new WarrenEditor((error) => report("Something went wrong in the editor", error));

  let file_path = $state<string | null>(null);
  let loading = $state(false);
  let more = $state(false);
  let root = $state<HTMLElement | null>(null);

  const file_name = $derived(file_path ? base_name(file_path) : document_file_name("Untitled"));
  const stem = $derived(stem_of(file_name));
  const read_only = $derived(file_path !== null && is_system_path(file_path));
  const text = $derived(document_text(editor.json));
  const counts = $derived(count(text));
  const repeats = $derived(repeated_words(text));
  const page = $derived(PAGE_MM[editor.page.size]);
  const sheets = $derived(editor.page.flow === Flow.SHEETS);

  const PAPER_VARS = Object.entries(BRAND_LIGHT)
    .map(([key, value]) => `--${key.replaceAll("_", "-")}:${value}`)
    .join(";");
  const STYLE_OPTIONS = [
    { value: BlockStyle.PARAGRAPH, label: "Body" },
    { value: BlockStyle.H1, label: "Heading 1" },
    { value: BlockStyle.H2, label: "Heading 2" },
    { value: BlockStyle.H3, label: "Heading 3" },
  ];
  const DOC_CSS = document_css(".warren-doc");

  $effect(() => win.set_title(file_name));
  $effect(() => win.set_dirty(editor.dirty, { save }));
  $effect(() => win.on_back(() => (more ? ((more = false), true) : false)));

  function report(title: string, reason: unknown) {
    notifications.notify(app_id, { type: NotificationType.ERROR, title, message: error_message(reason) });
  }

  async function discard_ok(): Promise<boolean> {
    return !editor.dirty || confirm_discard(win, file_name);
  }

  let open_request = 0;

  async function load(path: string) {
    const id = ++open_request;
    loading = true;
    try {
      const opened = await read_document(path);
      if (id !== open_request) return;
      editor.load(opened);
      file_path = path;
    } catch (reason) {
      if (id === open_request) report(`Couldn't open ${base_name(path)}`, reason);
    } finally {
      if (id === open_request) loading = false;
    }
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({ accept: [EXTENSION], start_path: file_path ? parent_path(file_path) : undefined, title: "Open in Warren" });
    if (chosen) await load(chosen);
  }

  async function create() {
    if (!(await discard_ok())) return;
    editor.reset();
    file_path = null;
    editor.focus();
  }

  async function write(path: string): Promise<boolean> {
    const snapshot = editor.snapshot();
    try {
      await write_file(path, serialize_document(snapshot));
      file_path = path;
      editor.mark_saved();
      notifications.notify(app_id, { title: "Document saved", message: path });
      return true;
    } catch (reason) {
      report("Couldn't save the document", reason);
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const path = await win.pick_save({
      name: file_name,
      accept: [EXTENSION],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home/Documents",
      title: "Save document",
    });
    return path ? write(with_extension(path, EXTENSION)) : false;
  }

  function save(): Promise<boolean> {
    return file_path && !read_only ? write(file_path) : save_as();
  }

  async function export_docx() {
    const path = await win.pick_save({
      name: `${stem}.docx`,
      accept: [".docx", DOCX_TYPE],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home/Documents",
      title: "Export for Word",
    });
    if (!path) return;
    const target = with_extension(path, ".docx");
    try {
      await write_file(target, await build_docx(editor.snapshot(), stem));
      notifications.notify(app_id, { title: "Exported for Word", message: target });
    } catch (reason) {
      report("Couldn't export the document", reason);
    }
  }

  async function export_pdf() {
    try {
      await print_html(print_document(editor.snapshot(), stem, inter_url), { title: stem });
    } catch (reason) {
      report("Couldn't print the document", reason);
    }
  }

  function export_as(format: "docx" | "pdf") {
    more = false;
    void (format === "docx" ? export_docx() : export_pdf());
  }

  function changed(changes: number, word: string) {
    notifications.notify(app_id, {
      type: changes ? NotificationType.INFO : NotificationType.WARNING,
      title: changes ? `Changed ${changes} ${changes === 1 ? "place" : "places"}` : `No “${word}” to change`,
      message: changes ? "Undo brings them all back." : "Only whole words are changed.",
    });
  }

  function anchor_of(event: MouseEvent) {
    const target = event.currentTarget;
    if (!(target instanceof Element)) return { x: event.clientX, y: event.clientY };
    const box = target.getBoundingClientRect();
    return { x: box.left, y: box.bottom + 4 };
  }

  async function file_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      [
        { id: "new", label: "New document", icon: FilePlusIcon },
        { id: "open", label: "Open…", icon: FolderOpenIcon, shortcut: "Mod+O" },
        { id: "save", label: "Save", icon: FloppyDiskIcon, shortcut: "Mod+S" },
        { id: "save-as", label: "Save as…", icon: FloppyDiskBackIcon, shortcut: "Mod+Shift+S" },
        { separator: true },
        { id: "docx", label: "Export for Word…", icon: FileDocIcon },
        { id: "pdf", label: "Print or save as PDF…", icon: FilePdfIcon, shortcut: "Mod+P" },
      ],
      { anchor: anchor_of(event) }
    );
    if (choice === "new") void create();
    else if (choice === "open") void open();
    else if (choice === "save") void save();
    else if (choice === "save-as") void save_as();
    else if (choice === "docx" || choice === "pdf") export_as(choice);
  }

  function mount_editor(element: HTMLElement) {
    root = element;
    return editor.mount(element);
  }

  $effect(() => {
    const element = root;
    if (!element) return;
    const ratio = sheets ? page.height / page.width : null;
    let frame = 0;
    const refill = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fill_sheets(element, ratio));
    };
    refill();
    const stop = editor.lexical.registerUpdateListener(refill);
    const observer = new ResizeObserver(refill);
    observer.observe(element.parentElement!);
    return () => {
      cancelAnimationFrame(frame);
      stop();
      observer.disconnect();
      fill_sheets(element, null);
    };
  });

  onMount(() => {
    const path = untrack(() => initial_path);
    if (path) void load(path);
    return () => editor.destroy();
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `warren.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("open", "mod+o", "Open…", open),
      scoped("save", "mod+s", "Save", save),
      scoped("save-as", "mod+shift+s", "Save as…", save_as),
      scoped("print", "mod+p", "Print or save as PDF", export_pdf),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  const keep_focus = (event: PointerEvent) => event.preventDefault();
</script>

<svelte:element this={"style"}>{DOC_CSS}</svelte:element>

<div class="warren relative grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] bg-background">
  <Toolbar class="flex-nowrap gap-1">
    <Button size="sm" variant="quiet" class="max-w-48 min-w-0 shrink gap-1 pr-1.5" title={file_path ?? "Not saved yet"} onclick={file_menu}>
      <span class="min-w-0 truncate">{mobile ? stem : "File"}</span>
      {#if mobile && editor.dirty}<span class="size-2 shrink-0 rounded-full bg-primary"></span>{/if}
      <CaretDownIcon weight="bold" class="size-3 shrink-0 opacity-65" />
    </Button>
    <IconButton label="Undo (Mod+Z)" size="sm" class="shrink-0" disabled={!editor.can_undo} onpointerdown={keep_focus} onclick={() => editor.undo()}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
    <IconButton label="Redo (Mod+Shift+Z)" size="sm" class="shrink-0" disabled={!editor.can_redo} onpointerdown={keep_focus} onclick={() => editor.redo()}><ArrowClockwiseIcon weight="bold" /></IconButton>
  </Toolbar>

  <div class="body grid min-h-0">
    <aside class="sidebar min-h-0 overflow-y-auto border-r border-foreground/8 bg-background-light" aria-label="Tools">
      <WarrenTools {editor} {text} {counts} {repeats} open={groups.value} ontoggle={(id, value) => (groups.value = { ...groups.value, [id]: value })} onexport={export_as} onchanged={changed} />
    </aside>

    <div class="flex min-h-0 min-w-0 flex-col">
      <div class="format-bar flex shrink-0 items-center gap-1 border-b border-foreground/8 bg-background-light px-2 py-1" role="toolbar" aria-label="Formatting">
        <IconButton label="Bold" size="sm" pressed={editor.bold} onpointerdown={keep_focus} onclick={() => editor.toggle_bold()}><TextBIcon weight="bold" /></IconButton>
        <IconButton label="Italic" size="sm" pressed={editor.italic} onpointerdown={keep_focus} onclick={() => editor.toggle_italic()}><TextItalicIcon weight="bold" /></IconButton>
        <Select
          size="sm"
          class="w-28 min-w-0"
          aria-label="Paragraph style"
          value={editor.block === BlockStyle.BULLET || editor.block === BlockStyle.NUMBER ? BlockStyle.PARAGRAPH : editor.block}
          options={STYLE_OPTIONS}
          onchange={(event) => {
            editor.set_block(event.currentTarget.value as BlockStyle);
            editor.focus();
          }}
        />
        <IconButton label="Bullets" size="sm" pressed={editor.block === BlockStyle.BULLET} onpointerdown={keep_focus} onclick={() => editor.set_block(BlockStyle.BULLET)}><ListBulletsIcon weight="bold" /></IconButton>
        <IconButton label="Numbers" size="sm" pressed={editor.block === BlockStyle.NUMBER} onpointerdown={keep_focus} onclick={() => editor.set_block(BlockStyle.NUMBER)}><ListNumbersIcon weight="bold" /></IconButton>
        <div class="flex-1"></div>
        <IconButton label="More tools" size="sm" onclick={() => (more = true)}><DotsThreeIcon weight="bold" /></IconButton>
      </div>

      <div class="desk min-h-0 flex-1 overflow-auto bg-background-darker" data-flow={editor.page.flow}>
        <div
          class="paper"
          style="{PAPER_VARS};--page-width:{page.width}mm;--page-margin:{page.margin}mm"
          onclick={(event) => event.target === event.currentTarget && editor.focus()}
          role="presentation"
        >
          <div
            class="warren-doc text-foreground"
            contenteditable="true"
            spellcheck="true"
            role="textbox"
            aria-multiline="true"
            aria-label="Document"
            tabindex="0"
            {@attach mount_editor}
          ></div>
        </div>
      </div>
    </div>

    {#if loading}
      <div class="absolute inset-0 grid place-items-center bg-background-darker/70"><Spinner label="Opening document" /></div>
    {/if}
  </div>

  <StatusBar>
    <span>{counts.words.toLocaleString("en")} {counts.words === 1 ? "word" : "words"}</span>
    <span>{counts.characters.toLocaleString("en")} {counts.characters === 1 ? "character" : "characters"}</span>
    <span class="hidden @sm:inline">{editor.page.size}</span>
  </StatusBar>

  {#if more}
    <div class="absolute inset-0 z-20 flex flex-col justify-end">
      <button type="button" tabindex="-1" aria-label="Close" class="absolute inset-0 bg-(--overlay)" onclick={() => (more = false)}></button>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tools"
        tabindex="-1"
        class="relative mx-auto flex max-h-[85%] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-background-light shadow-raised ring-1 ring-foreground/10 outline-none motion-safe:animate-sheet-in"
        {@attach (element) => element.focus({ preventScroll: true })}
        onkeydown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          more = false;
        }}
      >
        <span class="mx-auto mt-2 mb-1 h-1 w-10 shrink-0 rounded-full bg-foreground/20" aria-hidden="true"></span>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <WarrenTools {editor} {text} {counts} {repeats} open={groups.value} ontoggle={(id, value) => (groups.value = { ...groups.value, [id]: value })} onexport={export_as} onchanged={changed} />
        </div>
        <div class="flex justify-end border-t border-foreground/8 p-2">
          <Button variant="primary" onclick={() => (more = false)}>Done</Button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .body {
    grid-template-columns: minmax(0, 1fr);
  }

  .sidebar {
    display: none;
  }

  @container (width >= 44rem) {
    .body {
      grid-template-columns: 15rem minmax(0, 1fr);
    }

    .sidebar {
      display: block;
    }

    .format-bar {
      display: none;
    }
  }

  .desk {
    --desk: var(--background-darker);
    container-type: inline-size;
    padding: 1.5rem 0.75rem 3rem;
  }

  .paper {
    width: min(var(--page-width), 100cqi - 1.5rem);
    margin: 0 auto;
    padding: min(var(--page-margin), 7cqi);
    background: var(--background-lightest);
    box-shadow: 0 1px 3px color-mix(in oklch, var(--background-darkest) 30%, transparent);
    cursor: text;
  }

  .desk[data-flow="continuous"] {
    padding-top: 0;
    padding-bottom: 0;
  }

  .desk[data-flow="continuous"] .paper {
    min-height: 100%;
    box-shadow: none;
  }

  .warren-doc {
    position: relative;
    min-height: 1lh;
    padding-bottom: var(--tail, 0px);
    outline: none;
    caret-color: var(--primary);
  }

  .warren-doc :global(.wr-underline) {
    text-decoration: underline;
  }

  .warren-doc :global(.wr-strike) {
    text-decoration: line-through;
  }

  .warren-doc :global(.wr-underline.wr-strike) {
    text-decoration: underline line-through;
  }

  .warren-doc :global(.page-break) {
    position: relative;
    margin-inline: calc(-1 * min(var(--page-margin), 7cqi));
    user-select: none;
  }

  .desk[data-flow="sheets"] .warren-doc :global(.page-break) {
    --edge: min(var(--page-margin), 7cqi);
    box-sizing: content-box;
    height: calc(2 * var(--edge) + 1.5rem);
    padding-top: var(--fill, 0px);
    background: linear-gradient(
      to bottom,
      transparent calc(var(--fill, 0px) + var(--edge)),
      var(--desk) 0 calc(var(--fill, 0px) + var(--edge) + 1.5rem),
      transparent 0
    );
  }

  .desk[data-flow="continuous"] .warren-doc :global(.page-break) {
    height: 1.5rem;
    margin-inline: 0;
    background: linear-gradient(to bottom, transparent calc(50% - 0.5px), color-mix(in oklch, var(--foreground) 25%, transparent) 0 calc(50% + 0.5px), transparent 0);
  }

  .desk[data-flow="continuous"] .warren-doc :global(.page-break)::after {
    content: "Page break";
    position: absolute;
    inset: 50% auto auto 50%;
    translate: -50% -50%;
    padding-inline: 0.5rem;
    background: var(--background-lightest);
    font-size: 0.6875rem;
    color: color-mix(in oklch, var(--foreground) 65%, transparent);
  }

  .warren-doc :global(.page-break.selected),
  .warren-doc :global(.page-break:focus) {
    outline: 2px solid var(--cottontail);
  }
</style>

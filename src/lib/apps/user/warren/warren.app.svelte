<script lang="ts">
  import kernel, { NotificationType, Platform, ShortcutCategory, type DialogsService, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import { BRAND_LIGHT } from "$lib/core/api/services/settings/themes";
  import { Button, Grabber, IconButton, Select, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { base_name, file_extension, parent_path } from "$lib/core/api/services/files/path";
  import { error_message, format_bytes } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { print_html } from "$lib/core/utils/print";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    Camera as CameraIcon,
    Devices as DevicesIcon,
    Image as ImageIcon,
    Stack as StackIcon,
    StackPlus as StackPlusIcon,
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
    TextUnderline as TextUnderlineIcon,
  } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import { z } from "zod";
  import inter_url from "../../../../assets/fonts/InterVariable.woff2?url";
  import { build_docx, DOCX_TYPE, font_name } from "./docx";
  import { BlockStyle, LIST_STYLES, WarrenEditor, Zone, type Margin } from "./editor.svelte";
  import { EXTENSION, serialize_document, type WarrenDocument } from "./format";
  import { document_file_name, font_sources, read_document, read_file, stem_of, with_extension, write_file } from "./io";
  import { document_text, picture_size } from "./model";
  import { Flow, geometry, ZONE_GAP_MM, zone_distance } from "./page";
  import { BODY_FAMILY, document_css } from "./print";
  import { printable } from "./print-layout";
  import { TEMPLATES_DIR, type Template } from "./templates";
  import WarrenTemplates from "./warren-templates.svelte";
  import { fill_sheets } from "./sheets";
  import WarrenFind from "./warren-find.svelte";
  import WarrenLink from "./warren-link.svelte";
  import WarrenTools from "./warren-tools.svelte";
  import { face_css } from "./fonts";
  import { load_faces, type FaceSource } from "$lib/core/utils/font-loader";
  import { font_label } from "$lib/core/api/services/settings/fonts";
  import type { FontChoice } from "$lib/core/api/services/settings/type";
  import { count, reading_minutes, repeated_words } from "./words";
  import { report_error } from "$kit/utils/report-error";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const groups = storage.persisted<Record<string, boolean>>("groups", {}, z.record(z.string(), z.boolean()));
  const mobile = kernel.platform === Platform.MOBILE;

  const smart = storage.persisted<boolean>("smart", true, z.boolean());

  const units = storage.persisted<"mm" | "in">("units", "mm", z.enum(["mm", "in"]));

  // Past this the .warren file is slow to open and save, and a phone may run short of memory.
  const LARGE_PICTURES = 5 * 1024 * 1024;
  let warned_large = false;

  const editor = new WarrenEditor(
    (error) => report_error(app_id, "Something went wrong in the editor", error),
    () => smart.value,
    {
      failed: (reason) => report_error(app_id, "Couldn't add the picture", reason),
      added: () => {
        const size = picture_size(editor.snapshot());
        if (size < LARGE_PICTURES || warned_large) return;
        warned_large = true;
        notifications.notify(app_id, {
          type: NotificationType.WARNING,
          title: "This document is getting large",
          message: `Its pictures take ${format_bytes(size)}, so saving and opening slow down. Fewer or smaller pictures keep it quick.`,
        });
      },
    }
  );

  let file_path = $state<string | null>(null);
  let draft = $state<{ name: string; folder: string } | null>(null);
  let loading = $state(false);
  let more = $state(false);
  let root = $state<HTMLElement | null>(null);

  const file_name = $derived(file_path ? base_name(file_path) : (draft?.name ?? document_file_name("Untitled")));
  const stem = $derived(stem_of(file_name));
  const read_only = $derived(file_path !== null && is_system_path(file_path));
  const folder = $derived(file_path && !read_only ? parent_path(file_path) : (draft?.folder ?? "/home/Documents"));
  const text = $derived(document_text(editor.json));
  const counts = $derived(count(text));
  const repeats = $derived(repeated_words(text));
  const selection = $derived(editor.selected ? count(editor.selected) : null);
  const goal_progress = $derived(editor.goal ? Math.min(1, counts.words / editor.goal) : null);
  const page = $derived(geometry(editor.page));
  const has_header = $derived(editor.has(Zone.HEADER));
  const has_footer = $derived(editor.has(Zone.FOOTER));
  let head = $state<HTMLElement | null>(null);
  let foot = $state<HTMLElement | null>(null);
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
  const DOC_CSS = document_css(".warren-doc", "var(--doc-font,Inter)") + document_css(".zone-doc", "var(--doc-font,Inter)");
  const uid = $props.id();
  const link_id = `warren-link-${uid}`;
  const link_anchor = `--warren-link-${uid}`;

  const find_input_id = `warren-find-input-${uid}`;
  let finding = $state(false);

  function open_find() {
    more = false;
    if (!finding) {
      finding = true;
      return;
    }
    const input = document.getElementById(find_input_id);
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  }

  let link_placement = $state<"anchor" | "center" | "sheet">("anchor");

  // From the More sheet the button goes away with the sheet, so there is nothing to anchor to.
  function open_link() {
    link_placement = mobile ? "sheet" : more ? "center" : "anchor";
    more = false;
    document.getElementById(link_id)?.showPopover();
  }

  let body = $state.raw<{ family: string; sources: FaceSource[] } | null>(null);
  let body_faces: FontFace[] = [];
  let font_request = 0;
  const font_key = $derived(JSON.stringify(editor.page.font ?? null));

  function drop_faces() {
    for (const face of body_faces) document.fonts.delete(face);
    body_faces = [];
  }

  // Each window registers its own family, so two documents in two fonts don't fight over one name.
  $effect(() => {
    const choice = JSON.parse(font_key) as FontChoice | null;
    const request = ++font_request;
    if (!choice || choice.kind === "default") {
      drop_faces();
      body = null;
      return;
    }
    void (async () => {
      try {
        const sources = await font_sources(choice);
        const family = `warren-${window_id}-${request}`;
        const faces = await load_faces(family, sources);
        if (request !== font_request) return;
        drop_faces();
        for (const face of faces) document.fonts.add(face);
        body_faces = faces;
        body = { family, sources };
      } catch (reason) {
        if (request !== font_request) return;
        body = null;
        notifications.notify(app_id, {
          type: NotificationType.WARNING,
          title: `Couldn't load ${font_label(choice, "sans")}`,
          message: `${error_message(reason)}. Showing Inter instead.`,
        });
      }
    })();
  });

  async function print_faces(): Promise<string> {
    const choice = editor.page.font;
    if (!choice || choice.kind === "default") return "";
    if (body) return face_css(BODY_FAMILY, body.sources);
    try {
      return face_css(BODY_FAMILY, await font_sources(choice));
    } catch {
      return "";
    }
  }

  $effect(() => win.set_title(file_name));
  $effect(() => win.set_dirty(editor.dirty, { save }));
  $effect(() => win.on_back(() => (more ? ((more = false), true) : finding ? ((finding = false), editor.focus(), true) : false)));

  async function discard_ok(): Promise<boolean> {
    return !editor.dirty || confirm_discard(win, file_name);
  }

  let open_request = 0;

  async function load(path: string) {
    const id = ++open_request;
    loading = true;
    try {
      if (file_extension(path) === ".docx") {
        await import_docx(path, id);
        return;
      }
      const opened = await read_document(path);
      if (id !== open_request) return;
      editor.load(opened);
      file_path = path;
      draft = null;
    } catch (reason) {
      if (id === open_request) report_error(app_id, `Couldn't open ${base_name(path)}`, reason);
    } finally {
      if (id === open_request) loading = false;
    }
  }

  // A Word file opens as a new, untitled document named after it; Save then asks where the .warren goes.
  async function import_docx(path: string, id: number) {
    const file = await read_file(path);
    const { docx_to_html } = await import("./docx-import");
    const imported = await docx_to_html(await file.arrayBuffer());
    if (id !== open_request) return;
    editor.load_html(imported.html);
    file_path = null;
    draft = { name: document_file_name(base_name(path)), folder: is_system_path(path) ? "/home/Documents" : parent_path(path) };
    if (imported.left_out.length) {
      notifications.notify(app_id, {
        type: NotificationType.WARNING,
        title: `Some of ${base_name(path)} didn't come across`,
        message: `Left out: ${imported.left_out.join(", ")}.`,
      });
    }
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({ accept: [EXTENSION, ".docx", DOCX_TYPE], start_path: file_path ? parent_path(file_path) : undefined, title: "Open in Warren" });
    if (chosen) await load(chosen);
  }

  async function create() {
    if (!(await discard_ok())) return;
    editor.reset();
    file_path = null;
    draft = null;
    warned_large = false;
    editor.focus();
  }

  async function from_template() {
    if (!(await discard_ok())) return;
    const choice = await dialogs.show(WarrenTemplates, {}, { window: window_id });
    if (!choice) return;
    if (choice === "blank") return create();
    let document: WarrenDocument;
    try {
      document = await choice.load();
    } catch (reason) {
      report_error(app_id, `Couldn't open the ${choice.name} template`, reason);
      return;
    }
    open_request++;
    loading = false;
    editor.load(document);
    file_path = null;
    draft = { name: document_file_name(choice.name), folder: "/home/Documents" };
    warned_large = false;
  }

  async function save_template() {
    const path = await win.pick_save({ name: file_name, accept: [EXTENSION], start_path: TEMPLATES_DIR, title: "Save as template" });
    if (!path) return;
    const target = with_extension(path, EXTENSION);
    try {
      await write_file(target, serialize_document(editor.snapshot()));
      notifications.notify(app_id, { title: "Saved as a template", message: `${target}. File › New from template… starts from it.` });
    } catch (reason) {
      report_error(app_id, "Couldn't save the template", reason);
    }
  }

  async function picture_menu(event: MouseEvent) {
    more = false;
    const zone = editor.active;
    const choice = await dialogs.menu(
      [
        ...(mobile ? [{ id: "camera", label: "Take a photo", icon: CameraIcon }] : []),
        { id: "device", label: mobile ? "Choose a picture" : "From this device…", icon: DevicesIcon },
        { id: "files", label: "From files…", icon: FolderOpenIcon },
      ],
      { anchor: anchor_of(event) }
    );
    if (!choice) return;
    let pictures: File[] = [];
    try {
      if (choice === "camera") pictures = await pick_device_files({ accept: ["image/*"], capture: "environment" });
      else if (choice === "device") pictures = await pick_device_files({ accept: ["image/*"], multiple: true });
      else {
        const paths = await win.pick_file({ accept: ["image/*"], multiple: true, title: "Insert pictures" });
        for (const path of paths) pictures.push(await read_file(path));
      }
    } catch (reason) {
      report_error(app_id, "Couldn't add the picture", reason);
      return;
    }
    if (pictures.length) await editor.insert_pictures(pictures, zone === Zone.BODY ? editor.lexical : editor.zones[zone]);
  }

  async function set_zone(zone: Margin, on: boolean) {
    if (!on && editor.has(zone) && !editor.zone_empty(zone)) {
      const label = zone === Zone.HEADER ? "header" : "footer";
      const ok = await win.confirm(`Remove the ${label}?`, { detail: `What's in it goes from every page.`, confirm_label: "Remove", danger: true });
      if (!ok) return;
    }
    editor.set_zone(zone, on);
    if (on) requestAnimationFrame(() => editor.focus(zone));
  }

  async function write(path: string): Promise<boolean> {
    const snapshot = editor.snapshot();
    try {
      await write_file(path, serialize_document(snapshot));
      file_path = path;
      draft = null;
      editor.mark_saved();
      notifications.notify(app_id, { title: "Document saved", message: path });
      return true;
    } catch (reason) {
      report_error(app_id, "Couldn't save the document", reason);
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const path = await win.pick_save({
      name: file_name,
      accept: [EXTENSION],
      start_path: folder,
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
      start_path: folder,
      title: "Export for Word",
    });
    if (!path) return;
    const target = with_extension(path, ".docx");
    try {
      const snapshot = editor.snapshot();
      await write_file(target, await build_docx(snapshot, stem));
      const font = snapshot.page.font;
      if (font && font.kind !== "default") {
        notifications.notify(app_id, {
          type: NotificationType.WARNING,
          title: "Exported for Word",
          message: `${target}. Word shows ${font_name(font)} only where it's installed; elsewhere it picks a similar font.`,
        });
      } else {
        notifications.notify(app_id, { title: "Exported for Word", message: target });
      }
    } catch (reason) {
      report_error(app_id, "Couldn't export the document", reason);
    }
  }

  async function export_pdf() {
    try {
      await print_html(await printable(editor.snapshot(), stem, inter_url, await print_faces()), { title: stem });
    } catch (reason) {
      report_error(app_id, "Couldn't print the document", reason);
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
        { id: "template", label: "New from template…", icon: StackIcon },
        { id: "open", label: "Open…", icon: FolderOpenIcon, shortcut: "Mod+O" },
        { id: "save", label: "Save", icon: FloppyDiskIcon, shortcut: "Mod+S" },
        { id: "save-as", label: "Save as…", icon: FloppyDiskBackIcon, shortcut: "Mod+Shift+S" },
        { id: "save-template", label: "Save as template…", icon: StackPlusIcon },
        { separator: true },
        { id: "docx", label: "Export for Word…", icon: FileDocIcon },
        { id: "pdf", label: "Print or save as PDF…", icon: FilePdfIcon, shortcut: "Mod+P" },
      ],
      { anchor: anchor_of(event) }
    );
    if (choice === "new") void create();
    else if (choice === "template") void from_template();
    else if (choice === "save-template") void save_template();
    else if (choice === "open") void open();
    else if (choice === "save") void save();
    else if (choice === "save-as") void save_as();
    else if (choice === "docx" || choice === "pdf") export_as(choice);
  }

  function mount_editor(element: HTMLElement) {
    root = element;
    return editor.mount(element);
  }

  const mount_zone = (zone: Margin) => (element: HTMLElement) => editor.mount(element, zone);

  $effect(() => {
    const element = root;
    const zones = head && foot ? { head, foot } : null;
    if (!element || !zones) return;
    const ratio = sheets ? page.height / page.width : null;
    let frame = 0;
    const refill = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fill_sheets(element, ratio, zones));
    };
    refill();
    const stops = [editor.lexical, editor.zones.header, editor.zones.footer].map((lexical) => lexical.registerUpdateListener(refill));
    const observer = new ResizeObserver(refill);
    observer.observe(element.parentElement!);
    observer.observe(zones.head);
    observer.observe(zones.foot);
    return () => {
      cancelAnimationFrame(frame);
      for (const stop of stops) stop();
      observer.disconnect();
      fill_sheets(element, null);
    };
  });

  onMount(() => {
    const path = untrack(() => initial_path);
    if (path) void load(path);
    return () => {
      font_request++;
      drop_faces();
      editor.destroy();
    };
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `warren.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("open", "mod+o", "Open…", open),
      scoped("save", "mod+s", "Save", save),
      scoped("save-as", "mod+shift+s", "Save as…", save_as),
      scoped("print", "mod+p", "Print or save as PDF", export_pdf),
      scoped("find", "mod+f", "Find and replace", open_find),
      scoped("strike", "mod+shift+x", "Strikethrough", () => editor.toggle_strike()),
      scoped("subscript", "mod+shift+,", "Subscript", () => editor.toggle_subscript()),
      scoped("superscript", "mod+shift+.", "Superscript", () => editor.toggle_superscript()),
      scoped("clear-formatting", "mod+\\", "Clear formatting", () => editor.clear_formatting()),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  const keep_focus = (event: PointerEvent) => event.preventDefault();

  // On a phone the jump closes the More sheet and keeps the keyboard down.
  function go_to(key: string) {
    more = false;
    editor.go_to(key, !mobile);
  }
</script>

{#snippet tools()}
  <WarrenTools
    {editor}
    {text}
    {counts}
    {repeats}
    {selection}
    open={groups.value}
    ontoggle={(id, value) => (groups.value = { ...groups.value, [id]: value })}
    onexport={export_as}
    onchanged={changed}
    onlink={open_link}
    {link_anchor}
    onfind={open_find}
    smart={smart.value}
    onsmart={(on) => (smart.value = on)}
    ongo={go_to}
    onpicture={picture_menu}
    onzone={set_zone}
    units={units.value}
    onunits={(value) => (units.value = value)}
  />
{/snippet}

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
      {@render tools()}
    </aside>

    <div class="flex min-h-0 min-w-0 flex-col">
      <div class="format-bar flex shrink-0 items-center gap-1 border-b border-foreground/8 bg-background-light px-2 py-1" role="toolbar" aria-label="Formatting">
        <IconButton label="Bold" size="sm" pressed={editor.bold} onpointerdown={keep_focus} onclick={() => editor.toggle_bold()}><TextBIcon weight="bold" /></IconButton>
        <IconButton label="Italic" size="sm" pressed={editor.italic} onpointerdown={keep_focus} onclick={() => editor.toggle_italic()}><TextItalicIcon weight="bold" /></IconButton>
        <IconButton label="Underline" size="sm" pressed={editor.underline} onpointerdown={keep_focus} onclick={() => editor.toggle_underline()}><TextUnderlineIcon weight="bold" /></IconButton>
        <Select
          size="sm"
          class="w-32 min-w-0"
          aria-label="Paragraph style"
          value={LIST_STYLES.includes(editor.block) ? BlockStyle.PARAGRAPH : editor.block}
          options={STYLE_OPTIONS}
          onchange={(event) => {
            editor.set_block(event.currentTarget.value as BlockStyle);
            editor.focus();
          }}
        />
        <IconButton label="Bullets" size="sm" pressed={editor.block === BlockStyle.BULLET} onpointerdown={keep_focus} onclick={() => editor.set_block(BlockStyle.BULLET)}><ListBulletsIcon weight="bold" /></IconButton>
        <IconButton label="Numbers" size="sm" pressed={editor.block === BlockStyle.NUMBER} onpointerdown={keep_focus} onclick={() => editor.set_block(BlockStyle.NUMBER)}><ListNumbersIcon weight="bold" /></IconButton>
        <IconButton label="Insert picture" size="sm" disabled={editor.adding > 0} onpointerdown={keep_focus} onclick={picture_menu}><ImageIcon weight="bold" /></IconButton>
        <div class="flex-1"></div>
        <IconButton label="More tools" size="sm" onclick={() => (more = true)}><DotsThreeIcon weight="bold" /></IconButton>
      </div>

      {#if finding}
        <WarrenFind {editor} input_id={find_input_id} onclose={() => (finding = false)} onreplaced={changed} />
      {/if}

      <div class="desk min-h-0 flex-1 overflow-auto bg-background-darker" data-flow={editor.page.flow}>
        <div
          class="paper text-foreground"
          style="{PAPER_VARS};--pw:{page.width};--ph:{page.height};--mt:{page.margins.top};--mr:{page.margins.right};--mb:{page.margins.bottom};--ml:{page.margins.left};--hd:{zone_distance(
            page.margins.top
          )};--fd:{zone_distance(page.margins.bottom)};--zg:{ZONE_GAP_MM}{body ? `;--doc-font:'${body.family}'` : ''}"
          onclick={(event) => event.target === event.currentTarget && editor.focus(Zone.BODY)}
          role="presentation"
        >
          <div class={["zone head", !has_header && "spacer"]} bind:this={head} onclick={(event) => has_header && event.target === event.currentTarget && editor.focus(Zone.HEADER)} role="presentation">
            {#if has_header}
              <div class="zone-doc" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Header" tabindex="0" {@attach mount_zone(Zone.HEADER)}></div>
            {/if}
          </div>
          <div
            class="warren-doc"
            contenteditable="true"
            spellcheck="true"
            role="textbox"
            aria-multiline="true"
            aria-label="Document"
            tabindex="0"
            {@attach mount_editor}
          ></div>
          <div class={["zone foot", !has_footer && "spacer"]} bind:this={foot} onclick={(event) => has_footer && event.target === event.currentTarget && editor.focus(Zone.FOOTER)} role="presentation">
            {#if has_footer}
              <div class="zone-doc" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Footer" tabindex="0" {@attach mount_zone(Zone.FOOTER)}></div>
            {/if}
          </div>
        </div>
      </div>
    </div>

    {#if loading}
      <div class="absolute inset-0 grid place-items-center bg-background-darker/70"><Spinner label="Opening document" /></div>
    {/if}
  </div>

  <StatusBar>
    <span>{selection ? `${selection.words.toLocaleString("en")} of ` : ""}{counts.words.toLocaleString("en")} {counts.words === 1 && !selection ? "word" : "words"}</span>
    {#if goal_progress !== null && editor.goal}
      <span class="flex shrink-0 items-center gap-1.5" title="Word goal: {editor.goal.toLocaleString('en')}">
        <span
          class="relative h-1.5 w-12 overflow-hidden rounded-full bg-foreground/12"
          role="progressbar"
          aria-label="Word goal"
          aria-valuemin={0}
          aria-valuemax={editor.goal}
          aria-valuenow={Math.min(counts.words, editor.goal)}
        >
          <span class="absolute inset-y-0 left-0 rounded-full {goal_progress >= 1 ? 'bg-success' : 'bg-primary'}" style="width: {goal_progress * 100}%"></span>
        </span>
        <span>{Math.round(goal_progress * 100)}%</span>
      </span>
    {/if}
    {#if counts.words}<span class="hidden @md:inline">{reading_minutes(counts.words)} min read</span>{/if}
    <span class="hidden @sm:inline">
      {selection ? `${selection.characters.toLocaleString("en")} of ` : ""}{counts.characters.toLocaleString("en")} {counts.characters === 1 && !selection ? "character" : "characters"}
    </span>
    {#if editor.active !== Zone.BODY}<span class="text-primary">Editing the {editor.active}</span>{/if}
    <span class="hidden @lg:inline">{editor.page.size}{editor.page.orientation === "landscape" ? " landscape" : ""}</span>
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
        {@attach swipe_dismiss({ on_dismiss: () => (more = false) })}
        onkeydown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          more = false;
        }}
      >
        <Grabber class="mt-2 mb-1" />
        <div class="min-h-0 flex-1 overflow-y-auto">
          {@render tools()}
        </div>
        <div class="flex justify-end border-t border-foreground/8 p-2">
          <Button variant="primary" onclick={() => (more = false)}>Done</Button>
        </div>
      </div>
    </div>
  {/if}
  <WarrenLink id={link_id} anchor={link_anchor} {editor} placement={link_placement} />
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

  /* Margins scale with the paper (cqi inside it is the paper's width), so a narrow window shows the same page smaller. */
  .paper {
    --link: var(--primary);
    --pl: calc(var(--ml) / var(--pw) * 100cqi);
    --pr: calc(var(--mr) / var(--pw) * 100cqi);
    --pt: calc(var(--mt) / var(--pw) * 100cqi);
    --pb: calc(var(--mb) / var(--pw) * 100cqi);
    --phd: calc(var(--hd) / var(--pw) * 100cqi);
    --pfd: calc(var(--fd) / var(--pw) * 100cqi);
    --gap: calc(var(--zg) / var(--pw) * 100cqi);
    container: paper / inline-size;
    width: min(var(--pw) * 1mm, 100cqi - 1.5rem);
    margin: 0 auto;
    background: var(--background-lightest);
    box-shadow: 0 1px 3px color-mix(in oklch, var(--background-darkest) 30%, transparent);
    cursor: text;
  }

  /* On a phone-sized desk the side margins give way to the text, as before page setup existed. */
  @container (width < 40rem) {
    .paper {
      --pl: min(calc(var(--ml) / var(--pw) * 100cqi), 7cqi);
      --pr: min(calc(var(--mr) / var(--pw) * 100cqi), 7cqi);
    }
  }

  .paper :global(.zone) {
    box-sizing: border-box;
    padding-inline: var(--pl) var(--pr);
  }

  .paper :global(.zone.head) {
    min-height: var(--pt);
    padding-top: var(--phd);
    padding-bottom: var(--gap);
  }

  .paper :global(.zone.foot) {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    min-height: var(--pb);
    padding-top: var(--gap);
    padding-bottom: var(--pfd);
  }

  .paper :global(.zone.spacer) {
    padding-block: 0;
  }

  .paper :global(.zone-doc) {
    position: relative;
    min-height: 1lh;
    outline: none;
    caret-color: var(--primary);
  }

  .paper :global(.zone-doc > :last-child) {
    margin-bottom: 0;
  }

  .zone-doc {
    border-radius: 2px;
    box-shadow: 0 0 0 1px transparent;
  }

  .zone-doc:hover,
  .zone-doc:focus {
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 45%, transparent);
  }

  .zone-doc:has(> :global(p:only-child > br:only-child))::before {
    content: attr(aria-label);
    position: absolute;
    color: color-mix(in oklch, var(--foreground) 40%, transparent);
    pointer-events: none;
  }

  .paper :global(.zone.copy) {
    cursor: default;
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
    padding-inline: var(--pl) var(--pr);
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
    margin-inline: calc(-1 * var(--pl)) calc(-1 * var(--pr));
    user-select: none;
  }

  .desk[data-flow="sheets"] .warren-doc :global(.page-break) {
    display: flow-root;
    padding-top: var(--fill, 0px);
  }

  .warren-doc :global(.page-break .desk-gap) {
    height: 1.5rem;
    background: var(--desk);
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
  .warren-doc :global(.page-break:focus),
  .warren-doc :global(.wr-rule.selected) {
    outline: 2px solid var(--cottontail);
  }

  .paper :global(.wr-image) {
    margin: 0 0 6pt;
    line-height: 0;
    user-select: none;
  }

  .paper :global(.wr-image[data-align="center"]) {
    text-align: center;
  }

  .paper :global(.wr-image[data-align="right"]) {
    text-align: right;
  }

  .paper :global(.wr-image-frame) {
    position: relative;
    display: inline-block;
    max-width: 100%;
    cursor: default;
  }

  .paper :global(.wr-image img) {
    width: 100%;
    height: auto;
  }

  .paper :global(.wr-image.selected .wr-image-frame) {
    outline: 2px solid var(--cottontail);
  }

  .paper :global(.wr-image-handle) {
    position: absolute;
    right: -6px;
    bottom: -6px;
    display: none;
    width: 12px;
    height: 12px;
    border: 2px solid var(--background-lightest);
    border-radius: 2px;
    background: var(--cottontail);
    cursor: nwse-resize;
    touch-action: none;
  }

  .paper :global(.wr-image[data-align="right"] .wr-image-handle) {
    right: auto;
    left: -6px;
    cursor: nesw-resize;
  }

  @media (pointer: fine) {
    .paper :global(.wr-image.selected .wr-image-handle) {
      display: block;
    }
  }

  .warren-doc :global(.wr-rule) {
    cursor: default;
  }

  .warren-doc::spelling-error,
  .warren-doc :global(*::spelling-error) {
    text-decoration: wavy underline var(--error);
    text-decoration-skip-ink: none;
  }

  .warren-doc::grammar-error,
  .warren-doc :global(*::grammar-error) {
    text-decoration: wavy underline var(--info);
    text-decoration-skip-ink: none;
  }

  .warren-doc :global(.wr-checked),
  .warren-doc :global(.wr-unchecked) {
    cursor: text;
  }

  .warren-doc :global(.wr-checked)::before,
  .warren-doc :global(.wr-unchecked)::before {
    cursor: pointer;
  }

  /* Lexical toggles a check when the tap lands within 32 px of the box, so a 44 px row makes a 44 px target. */
  @media (pointer: coarse) {
    .warren-doc :global(li.wr-checked:not(.nested)),
    .warren-doc :global(li.wr-unchecked:not(.nested)) {
      min-height: 2.75rem;
      padding-top: calc((2.75rem - 1lh) / 2);
    }

    .warren-doc :global(li.wr-checked:not(.nested))::before,
    .warren-doc :global(li.wr-unchecked:not(.nested))::before,
    .warren-doc :global(li.wr-checked:not(.nested))::after {
      translate: 0 calc((2.75rem - 1lh) / 2);
    }
  }
</style>

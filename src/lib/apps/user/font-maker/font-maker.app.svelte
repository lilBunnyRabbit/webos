<script lang="ts">
  import kernel, {
    NotificationType,
    Platform,
    ShortcutCategory,
    type AppsService,
    type DialogsService,
    type FilesService,
    type NotificationsService,
    type ShortcutsService,
  } from "$lib/core/api";
  import { Button, IconButton, Segmented, Slider, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { base_name, file_stem, parent_path } from "$lib/core/api/services/files/path";
  import { error_message } from "$lib/core/utils";
  import { print_html } from "$lib/core/utils/print";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { ImageFormat, save_image } from "$kit/utils/image";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowsOutLineHorizontal as ArrowsOutLineHorizontalIcon,
    Camera as CameraIcon,
    CaretDown as CaretDownIcon,
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    Devices as DevicesIcon,
    Eraser as EraserIcon,
    Export as ExportIcon,
    Eye as EyeIcon,
    FilePlus as FilePlusIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    Image as ImageIcon,
    Printer as PrinterIcon,
    Scan as ScanIcon,
    SlidersHorizontal as SlidersHorizontalIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import { z } from "zod";
  import { build_font, drawn_characters } from "./build";
  import { CHAR_SET_LABELS, set_characters, type CharSet } from "./charsets";
  import { FontEditor } from "./editor.svelte";
  import FontMakerCanvas from "./font-maker-canvas.svelte";
  import FontMakerFilmstrip from "./font-maker-filmstrip.svelte";
  import FontMakerGrid from "./font-maker-grid.svelte";
  import FontMakerPreview from "./font-maker-preview.svelte";
  import FontMakerScan from "./font-maker-scan.svelte";
  import FontMakerSettings from "./font-maker-settings.svelte";
  import { EXTENSION, serialize_project } from "./format";
  import { project_file_name, read_project, with_extension, write_file } from "./io";
  import {
    add_stroke,
    clamp_nudge,
    clear_guides,
    clear_strokes,
    create_project,
    glyph_of,
    has_guides,
    MAX_STROKE_WIDTH,
    MIN_STROKE_WIDTH,
    reset_spacing,
    set_guides,
    set_stroke_width,
    stroke_width,
    update_glyph,
    type FontProject,
  } from "./model";
  import { PRESSURE_MODES, PressureMode } from "./pressure";
  import { find_marks, type Quad } from "./scan";
  import { load_scan, scan_guides, type ScanImage } from "./scan-image";
  import { draw_template, PAGE, PNG_DPI, template_html, template_layout } from "./template";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const sample = storage.persisted("sample", "The quick brown fox jumps over the lazy dog", z.string().max(500));
  const show_guide = storage.persisted("show-guide", true, z.boolean());
  const pressure_mode = storage.persisted<PressureMode>("pressure", PressureMode.SPEED, z.enum(PRESSURE_MODES));
  const edit_spacing = storage.persisted("edit-spacing", false, z.boolean());
  const PRESSURE_OPTIONS = [
    { value: PressureMode.EVEN, label: "Even" },
    { value: PressureMode.SPEED, label: "Speed" },
  ];
  const popover = $props.id();
  const mobile = kernel.platform === Platform.MOBILE;

  const editor = new FontEditor(create_project());

  let file_path = $state<string | null>(null);
  let loading = $state(false);
  let pane = $state<"grid" | "editor">("grid");
  let scan = $state.raw<{ image: ScanImage; found: Quad | null; set: CharSet } | null>(null);
  let scanning = $state(false);
  let width_draft = $state<number | null>(null);

  const project = $derived(editor.project);
  const file_name = $derived(file_path ? base_name(file_path) : project_file_name(project.name));
  const read_only = $derived(file_path !== null && is_system_path(file_path));
  const glyph = $derived(glyph_of(project, editor.char));
  const drawn = $derived(drawn_characters(project).length);
  const width = $derived(width_draft ?? stroke_width(project));
  const nudged = $derived(!!glyph.lsb || !!glyph.rsb);
  const code = $derived(`U+${editor.char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);

  $effect(() => win.set_title(file_name));
  $effect(() => win.set_dirty(editor.dirty, { save }));
  $effect(() =>
    win.on_back(() => {
      if (scan) return close_scan(), true;
      if (pane === "editor") return (pane = "grid"), true;
      return false;
    })
  );

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
      const opened = await read_project(path);
      if (id !== open_request) return;
      editor.load(opened, true);
      file_path = path;
      pane = "grid";
    } catch (reason) {
      if (id === open_request) report(`Couldn't open ${base_name(path)}`, reason);
    } finally {
      if (id === open_request) loading = false;
    }
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({
      accept: [EXTENSION],
      start_path: file_path ? parent_path(file_path) : undefined,
      title: "Open in Font Maker",
    });
    if (chosen) await load(chosen);
  }

  async function create() {
    if (!(await discard_ok())) return;
    editor.load(create_project(), true);
    file_path = null;
    pane = "grid";
  }

  async function write(path: string): Promise<boolean> {
    const snapshot = editor.project;
    try {
      await write_file(path, serialize_project(snapshot));
      file_path = path;
      editor.mark_saved(snapshot);
      notifications.notify(app_id, { title: "Font project saved", message: path });
      return true;
    } catch (reason) {
      report("Couldn't save the font project", reason);
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const path = await win.pick_save({
      name: file_name,
      accept: [EXTENSION],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
      title: "Save font project",
    });
    return path ? write(with_extension(path, EXTENSION)) : false;
  }

  function save(): Promise<boolean> {
    return file_path && !read_only ? write(file_path) : save_as();
  }

  async function export_font() {
    if (!drawn) {
      notifications.notify(app_id, { type: NotificationType.WARNING, title: "Nothing to export yet", message: "Draw at least one character first." });
      return;
    }
    const path = await win.pick_save({
      name: `${file_stem(file_name) || project.name}.ttf`,
      accept: [".ttf", "font/ttf"],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
      title: "Export font",
    });
    if (!path) return;
    const target = with_extension(path, ".ttf");
    try {
      await write_file(target, new Blob([build_font(editor.project)], { type: "font/ttf" }));
      notifications.notify(app_id, {
        title: "Font exported",
        message: `${drawn} ${drawn === 1 ? "character" : "characters"} · ${target}`,
        actions: [{ label: "Open", on_click: () => void apps.open(target) }],
      });
    } catch (reason) {
      report("Couldn't export the font", reason);
    }
  }

  async function print_template(set: CharSet) {
    try {
      await print_html(template_html(template_layout(set), project.metrics, project.name), { title: `${project.name} ${CHAR_SET_LABELS[set]} template` });
    } catch (reason) {
      report("Couldn't print the template", reason);
    }
  }

  async function save_template(set: CharSet) {
    const scale = PNG_DPI / 25.4;
    const canvas = new OffscreenCanvas(Math.round(PAGE.width * scale), Math.round(PAGE.height * scale));
    draw_template(canvas.getContext("2d")!, template_layout(set), project.metrics, project.name);
    await save_image({
      app_id,
      window: win,
      canvas,
      name: `${project.name} ${CHAR_SET_LABELS[set]} template.png`,
      format: ImageFormat.PNG,
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
    });
  }

  async function start_scan(source: "camera" | "device" | "files") {
    let blob: Blob | null = null;
    if (source === "files") {
      const chosen = await win.pick_file({ accept: ["image/*"], title: "Scan a filled-in sheet" });
      if (chosen) blob = await kernel.service<FilesService>("files").get_file(chosen);
    } else if (source === "camera") blob = (await pick_device_files({ accept: ["image/*"], capture: "environment" }))[0] ?? null;
    else blob = (await pick_device_files({ accept: ["image/*"] }))[0] ?? null;
    if (!blob) return;
    scanning = true;
    try {
      const image = await load_scan(blob);
      close_scan();
      const current = set_characters(project.sets[0]).includes(editor.char) ? project.sets[0] : (project.sets.find((set) => set_characters(set).includes(editor.char)) ?? project.sets[0]);
      scan = { image, found: find_marks(image.gray), set: current };
    } catch (reason) {
      report("Couldn't read the picture", reason);
    } finally {
      scanning = false;
    }
  }

  function close_scan() {
    if (scan) URL.revokeObjectURL(scan.image.url);
    scan = null;
  }

  async function apply_scan(set: CharSet, corners: Quad) {
    if (!scan) return;
    scanning = true;
    try {
      const guides = await scan_guides(scan.image.gray, corners, set);
      close_scan();
      if (!guides.size) {
        notifications.notify(app_id, { type: NotificationType.WARNING, title: "No handwriting found", message: "No box on the sheet had writing in it. Check the corners and the sheet." });
        return;
      }
      editor.apply((value) => set_guides(value, guides));
      notifications.notify(app_id, { title: guides.size === 1 ? "1 guide added" : `${guides.size} guides added`, message: "Trace over each one with strokes." });
    } catch (reason) {
      report("Couldn't read the sheet", reason);
    } finally {
      scanning = false;
    }
  }

  async function remove_guides() {
    const ok = await win.confirm("Clear all guides?", { detail: "The scanned pictures behind each box are removed. Your strokes stay.", confirm_label: "Clear guides", danger: true });
    if (ok) editor.apply(clear_guides);
  }

  async function clear_glyph() {
    editor.apply((value) => clear_strokes(value, editor.char));
  }

  function nudge(side: "lsb" | "rsb", delta: number) {
    editor.apply((value) => update_glyph(value, editor.char, (item) => ({ ...item, [side]: clamp_nudge((item[side] ?? 0) + delta) })));
  }

  function commit_width(event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    width_draft = null;
    editor.apply((current) => set_stroke_width(current, value));
  }

  function select(char: string) {
    editor.char = char;
    pane = "editor";
  }

  function anchor_of(event: MouseEvent) {
    const target = event.currentTarget;
    if (!(target instanceof Element)) return { x: event.clientX, y: event.clientY };
    const box = target.getBoundingClientRect();
    return { x: box.left, y: box.bottom + 4 };
  }

  async function file_menu(event: MouseEvent) {
    const per_set = (prefix: string) => project.sets.map((set) => ({ id: `${prefix}:${set}`, label: CHAR_SET_LABELS[set] }));
    const choice = await dialogs.menu(
      [
        { id: "new", label: "New font", icon: FilePlusIcon },
        { id: "open", label: "Open…", icon: FolderOpenIcon, shortcut: "Mod+O" },
        { id: "save", label: "Save", icon: FloppyDiskIcon, shortcut: "Mod+S" },
        { id: "save-as", label: "Save as…", icon: FloppyDiskBackIcon, shortcut: "Mod+Shift+S" },
        { separator: true },
        { label: "Print template", icon: PrinterIcon, items: per_set("print") },
        { label: "Save template as PNG", icon: ImageIcon, items: per_set("png") },
        ...(has_guides(project) ? [{ separator: true as const }, { id: "clear-guides", label: "Clear guides", icon: TrashIcon, danger: true }] : []),
      ],
      { anchor: anchor_of(event) }
    );
    if (!choice) return;
    if (choice === "new") void create();
    else if (choice === "open") void open();
    else if (choice === "save") void save();
    else if (choice === "save-as") void save_as();
    else if (choice === "clear-guides") void remove_guides();
    else if (choice.startsWith("print:")) void print_template(choice.slice(6) as CharSet);
    else if (choice.startsWith("png:")) void save_template(choice.slice(4) as CharSet);
  }

  async function scan_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      [
        ...(mobile ? [{ id: "camera", label: "Take a photo", icon: CameraIcon }] : []),
        { id: "device", label: mobile ? "Choose a picture" : "From this device…", icon: DevicesIcon },
        { id: "files", label: "From files…", icon: FolderOpenIcon },
      ],
      { anchor: anchor_of(event) }
    );
    if (choice === "camera" || choice === "device" || choice === "files") void start_scan(choice);
  }

  onMount(() => {
    const path = untrack(() => initial_path);
    if (path) void load(path);
    return () => close_scan();
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `font-maker.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", () => editor.undo()),
      scoped("redo", "mod+shift+z", "Redo", () => editor.redo()),
      scoped("redo-alt", "mod+y", "Redo", () => editor.redo()),
      scoped("open", "mod+o", "Open…", open),
      scoped("save", "mod+s", "Save", save),
      scoped("save-as", "mod+shift+s", "Save as…", save_as),
      scoped("previous", "[", "Previous character", () => editor.step(-1)),
      scoped("next", "]", "Next character", () => editor.step(1)),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });
</script>

<div class="font-maker relative grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] bg-background" data-pane={pane}>
  <Toolbar class="flex-nowrap gap-1">
    <Button size="sm" variant="quiet" class="max-w-40 min-w-0 shrink gap-1 pr-1.5" title={file_path ?? "Not saved yet"} onclick={file_menu}>
      <span class="min-w-0 truncate">{mobile ? file_stem(file_name) : "File"}</span>
      {#if mobile && editor.dirty}<span class="size-2 shrink-0 rounded-full bg-primary"></span>{/if}
      <CaretDownIcon weight="bold" class="size-3 shrink-0 opacity-65" />
    </Button>
    <IconButton label="Undo (Mod+Z)" size="sm" class="shrink-0" disabled={!editor.undoable} onclick={() => editor.undo()}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
    <IconButton label="Redo (Mod+Shift+Z)" size="sm" class="shrink-0" disabled={!editor.redoable} onclick={() => editor.redo()}><ArrowClockwiseIcon weight="bold" /></IconButton>
    <div class="flex-1"></div>
    <IconButton label="Scan a filled-in sheet" size="sm" class="shrink-0" disabled={scanning} onclick={scan_menu}><ScanIcon weight="bold" /></IconButton>
    <IconButton label="Font settings" size="sm" class="shrink-0" popovertarget="settings-{popover}" style="anchor-name: --settings-{popover}"><SlidersHorizontalIcon weight="bold" /></IconButton>
    <Button size="sm" class="shrink-0" onclick={export_font}><ExportIcon weight="bold" /><span class="hidden @md:inline">Export font</span></Button>
  </Toolbar>

  <div class="body grid min-h-0">
    <div class="grid-pane @container min-h-0 overflow-y-auto">
      <FontMakerGrid {project} selected={editor.char} onselect={select} />
    </div>

    <section class="editor-pane flex min-h-0 flex-col gap-2 overflow-y-auto border-foreground/8 bg-background-light p-3" aria-label="Editing {editor.char}">
      <div class="flex items-center gap-1">
        <IconButton label="All characters" size="sm" class="back shrink-0" onclick={() => (pane = "grid")}><ArrowLeftIcon weight="bold" /></IconButton>
        <IconButton label="Previous character ([)" size="sm" class="shrink-0" onclick={() => editor.step(-1)}><CaretLeftIcon weight="bold" /></IconButton>
        <span class="w-10 text-center text-xl leading-none">{editor.char}</span>
        <IconButton label="Next character (])" size="sm" class="shrink-0" onclick={() => editor.step(1)}><CaretRightIcon weight="bold" /></IconButton>
        <span class="ml-1 font-mono text-2xs text-foreground/65 tabular-nums">{code}</span>
        <div class="flex-1"></div>
        {#if glyph.guide}
          <IconButton label="Show guide" size="sm" pressed={show_guide.value} onclick={() => (show_guide.value = !show_guide.value)}><EyeIcon weight="bold" /></IconButton>
        {/if}
        <Button size="sm" variant="quiet" disabled={!editor.undoable} onclick={() => editor.undo()}><ArrowCounterClockwiseIcon weight="bold" />Undo</Button>
        <Button size="sm" variant="quiet" disabled={!glyph.strokes.length} onclick={clear_glyph}><EraserIcon weight="bold" />Clear</Button>
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label class="flex min-w-40 flex-1 items-center gap-2 text-ui">
          <span class="text-foreground/65">Width</span>
          <Slider
            size="sm"
            min={MIN_STROKE_WIDTH}
            max={MAX_STROKE_WIDTH}
            step={2}
            value={width}
            class="flex-1"
            oninput={(event) => (width_draft = Number(event.currentTarget.value))}
            onchange={commit_width}
          />
          <span class="w-7 text-right font-mono text-2xs tabular-nums">{width}</span>
        </label>
        <div class="flex items-center gap-1">
          <Segmented size="sm" label="Mouse and touch line" options={PRESSURE_OPTIONS} bind:value={pressure_mode.value} />
          <IconButton label="Edit spacing" size="sm" class="shrink-0" pressed={edit_spacing.value} onclick={() => (edit_spacing.value = !edit_spacing.value)}><ArrowsOutLineHorizontalIcon weight="bold" /></IconButton>
        </div>
      </div>

      <div class="canvas-wrap min-h-48 flex-1 overflow-hidden rounded-lg bg-background ring-1 ring-foreground/8">
        <FontMakerCanvas
          char={editor.char}
          {glyph}
          metrics={project.metrics}
          {width}
          pressure_mode={pressure_mode.value}
          edit_spacing={edit_spacing.value}
          show_guide={show_guide.value}
          onstroke={(stroke) => editor.apply((value) => add_stroke(value, editor.char, stroke))}
          onundo={() => editor.undo()}
          onnudge={(lsb, rsb) => editor.apply((value) => update_glyph(value, editor.char, (item) => ({ ...item, lsb, rsb })))}
        />
      </div>

      <FontMakerFilmstrip {project} characters={editor.characters} selected={editor.char} onselect={(char) => (editor.char = char)} />

      {#if edit_spacing.value}
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui">
          <span class="flex items-center gap-1">
            <span class="text-foreground/65">Left</span>
            <Button size="sm" variant="quiet" aria-label="Tighter on the left" onclick={() => nudge("lsb", -10)}>−</Button>
            <span class="w-9 text-center font-mono text-2xs tabular-nums">{glyph.lsb ?? 0}</span>
            <Button size="sm" variant="quiet" aria-label="Looser on the left" onclick={() => nudge("lsb", 10)}>+</Button>
          </span>
          <span class="flex items-center gap-1">
            <span class="text-foreground/65">Right</span>
            <Button size="sm" variant="quiet" aria-label="Tighter on the right" onclick={() => nudge("rsb", -10)}>−</Button>
            <span class="w-9 text-center font-mono text-2xs tabular-nums">{glyph.rsb ?? 0}</span>
            <Button size="sm" variant="quiet" aria-label="Looser on the right" onclick={() => nudge("rsb", 10)}>+</Button>
          </span>
          {#if nudged}
            <Button size="sm" variant="quiet" onclick={() => editor.apply((value) => reset_spacing(value, editor.char))}><ArrowCounterClockwiseIcon weight="bold" />Reset to auto</Button>
        {/if}
      </div>
      {/if}

      <FontMakerPreview {project} bind:sample={sample.value} />
    </section>

    {#if loading}
      <div class="absolute inset-0 grid place-items-center bg-background-darker/70"><Spinner label="Opening font project" /></div>
    {/if}
  </div>

  <StatusBar>
    <span>{drawn} drawn</span>
    <span class="hidden @sm:inline">{project.name}</span>
    <span class="hidden @md:inline">{project.sets.map((set) => CHAR_SET_LABELS[set]).join(", ")}</span>
  </StatusBar>

  {#if scan}
    <FontMakerScan
      scan={scan.image}
      found={scan.found}
      sets={project.sets}
      set={scan.set}
      busy={scanning}
      onapply={apply_scan}
      oncancel={close_scan}
    />
  {/if}
</div>

<FontMakerSettings id="settings-{popover}" anchor="--settings-{popover}" {project} onchange={(change) => editor.apply(change)} />

<style>
  .body {
    grid-template-columns: minmax(0, 1fr);
  }

  .font-maker[data-pane="editor"] .grid-pane,
  .font-maker[data-pane="grid"] .editor-pane {
    display: none;
  }

  .canvas-wrap {
    container-type: size;
  }

  @container (width >= 44rem) {
    .body {
      grid-template-columns: minmax(16rem, 1fr) minmax(22rem, 1.15fr);
    }

    .font-maker[data-pane] .grid-pane,
    .font-maker[data-pane] .editor-pane {
      display: flex;
    }

    .font-maker[data-pane] .grid-pane {
      display: block;
    }

    .editor-pane {
      border-left-width: 1px;
    }

    .editor-pane :global(.back) {
      display: none;
    }
  }
</style>

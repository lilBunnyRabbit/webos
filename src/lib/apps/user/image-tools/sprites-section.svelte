<script lang="ts">
  import kernel, { NotificationType, type AppsService, type FilesService, type NotificationsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    Button,
    Checkbox,
    EmptyState,
    IconButton,
    Input,
    Section,
    Segmented,
    Select,
    Separator,
    Spinner,
    StatusBar,
    Toolbar,
  } from "$lib/core/components/ui";
  import { cn, error_message } from "$lib/core/utils";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowsDownUp as ArrowsDownUpIcon,
    Columns as ColumnsIcon,
    CornersOut as CornersOutIcon,
    Crosshair as CrosshairIcon,
    Eye as EyeIcon,
    EyeSlash as EyeSlashIcon,
    FilmStrip as FilmStripIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    Rows as RowsIcon,
    Scan as ScanIcon,
    Tag as TagIcon,
    Trash as TrashIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { has_files, image_files, load_image } from "$kit/utils/image";
  import { ANCHORS, frame_file_name, frames_metadata, render_frames, render_sheet, type ExportOptions } from "./sprite-export";
  import { SpriteExtractState } from "./sprite-extract.svelte";
  import { count_overrides, DEFAULT_SETTINGS, format_sequence, GridMode, parse_sequence, SETTINGS_SCHEMA } from "./sprite-model";
  import SpriteFilmstrip from "./sprite-filmstrip.svelte";
  import SpriteNumberField from "./sprite-number-field.svelte";
  import SpritePreview from "./sprite-preview.svelte";
  import SpriteSheet from "./sprite-sheet.svelte";
  import type { SectionProps } from "./sections";
  import { base_name, parent_path, file_stem } from "$lib/core/api/services/files/path";

  const ZOOM_STEP = 1.25;

  const { picker, initial_paths }: SectionProps = $props();

  const { app_id, storage, window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const sprite = new SpriteExtractState(storage.get("sprite-settings", SETTINGS_SCHEMA) ?? DEFAULT_SETTINGS);

  $effect(() => storage.set("sprite-settings", sprite.settings));

  let sheet = $state<SpriteSheet>();
  let preview = $state<SpritePreview>();

  let loading = $state(false);
  let load_error = $state<{ title: string; description: string } | null>(null);
  let load_id = 0;

  let zoom = $state(1);
  let show_labels = $state(true);
  let space_held = $state(false);
  let dragging = $state(false);
  let sheet_columns = $state(0);
  let exporting = $state<{ done: number; total: number } | null>(null);
  let sequence_draft = $state<string | null>(null);

  const source = $derived(sprite.source);
  const grid = $derived(sprite.grid);
  const selected_frame = $derived(sprite.selected === null ? null : (grid.frames[sprite.selected] ?? null));
  const selected_included = $derived(sprite.selected !== null && sprite.sequence.includes(sprite.selected));
  const override_count = $derived(count_overrides(sprite.overrides));
  const has_line_overrides = $derived(Object.keys(sprite.overrides.columns).length + Object.keys(sprite.overrides.rows).length > 0);
  const sequence_text = $derived(sequence_draft ?? format_sequence(sprite.sequence));
  const sequence_valid = $derived(sequence_draft === null || parse_sequence(sequence_draft, grid.frames.length) !== null);
  const start_path = $derived(source?.path ? parent_path(source.path) : undefined);

  function report(title: string, error: unknown, type: NotificationType = NotificationType.ERROR) {
    if (type === NotificationType.ERROR) console.error(`[ImageTools] ${title}`, error);
    notifications.notify(app_id, { type, title, message: error_message(error) });
  }

  function show_folder_action(folder_path: string) {
    return [{ label: "Show folder", on_click: () => kernel.service<AppsService>("apps").launch("file-explorer", { path: folder_path }) }];
  }

  // An export keeps rendering from its bitmap after another sheet is opened; that one closes when the export ends.
  let saving: ImageBitmap | null = null;
  let destroyed = false;

  function release(bitmap: ImageBitmap) {
    if (bitmap !== saving) bitmap.close();
  }

  function done_saving(bitmap: ImageBitmap) {
    saving = null;
    if (destroyed || bitmap !== sprite.source?.bitmap) bitmap.close();
  }

  onDestroy(() => {
    destroyed = true;
    if (sprite.source) release(sprite.source.bitmap);
  });

  async function open_file(file: File, file_path: string | null) {
    const id = ++load_id;
    loading = true;
    try {
      const loaded = await load_image(file, file_path);
      if (id !== load_id) return loaded.bitmap.close();
      const previous = source;
      sprite.set_source(loaded);
      if (previous) release(previous.bitmap);
      sequence_draft = null;
      load_error = null;
    } catch (error) {
      if (id !== load_id) return;
      if (source) report("Couldn't open the image", error);
      else load_error = { title: "Couldn't open the image", description: error_message(error) };
    } finally {
      if (id === load_id) loading = false;
    }
  }

  async function open_path(file_path: string) {
    const id = ++load_id;
    try {
      const file = await files.get_file(file_path);
      if (id !== load_id) return;
      if (file) return open_file(file, file_path);
      if (source) report("File not found", file_path);
      else load_error = { title: "File not found", description: file_path };
    } catch (error) {
      if (id !== load_id) return;
      if (source) report("Couldn't read the file", error);
      else load_error = { title: "Couldn't read the file", description: error_message(error) };
    }
  }

  async function pick() {
    const chosen = await win.pick_file({ accept: ["image/*"], title: "Open a sprite sheet", start_path });
    if (chosen) open_path(chosen);
  }

  const initial = untrack(() => initial_paths[0]);
  if (initial) open_path(initial);

  function auto_detect() {
    if (sprite.auto_detect()) {
      sequence_draft = null;
      notifications.notify(app_id, { title: "Grid detected", message: "Found from the gaps between frames." });
    } else {
      report("Couldn't detect a grid", "There are no clear gaps between the frames.", NotificationType.WARNING);
    }
  }

  function export_options(): ExportOptions {
    return {
      source: source?.name ?? "sprite.png",
      uniform: sprite.uniform,
      anchor: sprite.anchor,
      sheet_columns: sheet_columns || grid.columns.length || sprite.sequence.length,
      fps: sprite.fps,
    };
  }

  async function save_frames() {
    if (!source || !sprite.sequence.length || exporting) return;
    const { bitmap, name } = source;
    const frames = grid.frames;
    const sequence = sprite.sequence;
    const options = export_options();
    const stem = file_stem(name);

    const folder = await win.pick_directory({ title: "Save frames to…", start_path });
    if (!folder || bitmap !== sprite.source?.bitmap) return;

    const total = sequence.length;
    exporting = { done: 0, total };
    saving = bitmap;
    try {
      const parent = await files.get_directory(folder);
      if (!parent) throw new Error(`${folder} no longer exists`);
      const target = await files.create_directory(parent, `${stem}-frames`);
      for await (const frame of render_frames(bitmap, frames, sequence, options)) {
        await files.create_file(target, frame_file_name(stem, frame.order, total), { content: frame.blob });
        exporting = { done: frame.order + 1, total };
      }
      await files.create_file(target, `${stem}.json`, { content: frames_metadata(frames, sequence, options) });
      const target_path = `${folder === "/" ? "" : folder}/${target.name}`;
      notifications.notify(app_id, { title: `Saved ${total} ${total === 1 ? "frame" : "frames"}`, message: target_path, actions: show_folder_action(target_path) });
    } catch (error) {
      report("Couldn't save the frames", error);
    } finally {
      exporting = null;
      done_saving(bitmap);
    }
  }

  async function save_sheet() {
    if (!source || !sprite.sequence.length || exporting) return;
    const { bitmap, name } = source;
    const frames = grid.frames;
    const sequence = sprite.sequence;
    const options = export_options();

    const chosen = await win.pick_save({ name: `${file_stem(name)}_sheet.png`, accept: [".png"], start_path, title: "Save sheet as" });
    if (!chosen || bitmap !== sprite.source?.bitmap) return;

    exporting = { done: 0, total: 1 };
    saving = bitmap;
    try {
      const folder = parent_path(chosen);
      const file_name = base_name(chosen);
      const directory = await files.get_directory(folder);
      if (!directory) throw new Error(`${folder} no longer exists`);
      const { png, json } = await render_sheet(bitmap, frames, sequence, options);
      await files.create_file(directory, file_name, { content: png, overwrite: true });
      // The picker only asked about replacing the PNG, so the metadata never overwrites; it takes a free name.
      const meta = await files.create_file(directory, `${file_stem(file_name)}.json`, { content: json });
      exporting = { done: 1, total: 1 };
      notifications.notify(app_id, { title: "Saved the sheet", message: `${chosen} and ${meta.name}`, actions: show_folder_action(folder) });
    } catch (error) {
      report("Couldn't save the sheet", error);
    } finally {
      exporting = null;
      done_saving(bitmap);
    }
  }

  function is_typing(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  }

  function on_keydown(event: KeyboardEvent) {
    if (is_typing(event.target)) return;
    if (event.code === "Space") space_held = true;
    if (!source || event.metaKey || event.ctrlKey) return;

    const step = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        if (sprite.selected === null) return;
        event.preventDefault();
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        sprite.nudge_selected(dx, dy, event.altKey);
        return;
      }
      case "Delete":
      case "Backspace":
        if (sprite.selected === null) return;
        event.preventDefault();
        sprite.toggle_in_sequence(sprite.selected);
        return;
      case "Escape":
        sprite.selected = null;
        return;
      case "r":
        if (sprite.selected !== null) sprite.reset_frame(sprite.selected);
        return;
      case "c":
        if (sprite.selected !== null) sprite.fit_frame_to_content(sprite.selected);
        return;
      case "f":
        sheet?.fit();
        return;
      case "p":
        preview?.toggle();
        return;
      case "[":
        preview?.prev();
        return;
      case "]":
        preview?.next();
        return;
      case "l":
        show_labels = !show_labels;
        return;
      case "+":
      case "=":
        sheet?.zoom_by(ZOOM_STEP);
        return;
      case "-":
        sheet?.zoom_by(1 / ZOOM_STEP);
        return;
    }
  }

  function on_drag(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    if (event.type === "dragleave") {
      if (!(event.currentTarget as Node).contains(event.relatedTarget as Node | null)) dragging = false;
    } else {
      dragging = true;
    }
  }

  function on_drop(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging = false;
    const file = image_files(event.dataTransfer)[0];
    if (file) open_file(file, null);
    else report("Not an image", "Drop a PNG, JPEG, WebP or other image file", NotificationType.WARNING);
  }

  function on_paste(event: ClipboardEvent) {
    const file = image_files(event.clipboardData)[0];
    if (!file) return;
    event.preventDefault();
    open_file(file, null);
  }
</script>

<!-- Focusable so clicks anywhere in the app take focus, which scopes paste and shortcuts to this window. -->
<div
  role="presentation"
  tabindex="-1"
  class={cn("relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto] outline-none", dragging && "ring-2 ring-primary ring-inset")}
  onkeydown={on_keydown}
  onkeyup={(event) => event.code === "Space" && (space_held = false)}
  onfocusout={(event) => !(event.currentTarget as Node).contains(event.relatedTarget as Node | null) && (space_held = false)}
  ondragenter={on_drag}
  ondragover={on_drag}
  ondragleave={on_drag}
  ondrop={on_drop}
  onpaste={on_paste}
>
  <Toolbar>
    {@render picker()}
    <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    {#if source}
      <span class="hidden min-w-0 flex-1 truncate px-1 text-ui font-medium @md:block" title={source.path ?? source.name}>{source.name}</span>
      <span class="flex-1 @md:hidden"></span>
      <IconButton label="Zoom out (-)" size="sm" onclick={() => sheet?.zoom_by(1 / ZOOM_STEP)}><MagnifyingGlassMinusIcon weight="bold" /></IconButton>
      <span class="min-w-11 text-center font-mono text-2xs text-foreground/80 tabular-nums">{Math.round(zoom * 100)}%</span>
      <IconButton label="Zoom in (+)" size="sm" onclick={() => sheet?.zoom_by(ZOOM_STEP)}><MagnifyingGlassPlusIcon weight="bold" /></IconButton>
      <IconButton label="Fit (F)" size="sm" onclick={() => sheet?.fit()}><CornersOutIcon weight="bold" /></IconButton>
      <Separator vertical />
      <IconButton
        label={show_labels ? "Hide frame numbers (L)" : "Show frame numbers (L)"}
        size="sm"
        pressed={show_labels}
        onclick={() => (show_labels = !show_labels)}
      >
        <TagIcon weight="bold" />
      </IconButton>
    {/if}
  </Toolbar>

  {#if !source}
    {#if loading}
      <div class="grid h-full place-items-center"><Spinner label="Loading image" /></div>
    {:else if load_error}
      <EmptyState icon={WarningCircleIcon} tone="error" title={load_error.title} description={load_error.description}>
        {#snippet actions()}<Button onclick={pick}><FolderOpenIcon weight="bold" /> Open another…</Button>{/snippet}
      </EmptyState>
    {:else}
      <EmptyState
        icon={FilmStripIcon}
        title="No sprite sheet open"
        description="Slice a sheet into frames, fix what doesn't line up, preview the animation and export. Open one, or drop or paste it here."
      >
        {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a sheet…</Button>{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <div class="flex min-h-0 flex-col overflow-y-auto @4xl:grid @4xl:grid-cols-[16rem_minmax(0,1fr)_17rem] @4xl:overflow-hidden">
      <aside class="order-2 flex flex-col gap-6 p-4 @4xl:order-none @4xl:overflow-y-auto @4xl:border-r @4xl:border-foreground/8">
        <Section title="Sheet" flush>
          <p class="font-mono text-2xs break-all text-foreground/65">{source.name} · {sprite.width}×{sprite.height}</p>
          <div class="grid grid-cols-2 gap-2">
            <Button size="sm" title="Find the grid from the gaps between frames" onclick={auto_detect}><ScanIcon weight="bold" /> Detect</Button>
            <Button size="sm" title="Clear every dragged line and adjusted frame" disabled={!override_count} onclick={() => sprite.reset_overrides()}>
              <TrashIcon weight="bold" /> Reset ({override_count})
            </Button>
          </div>
        </Section>

        <Section title="Grid" flush>
          <Segmented
            label="Grid mode"
            class="w-full [&>label]:flex-1 [&>label]:justify-center"
            bind:value={() => sprite.settings.mode, (mode) => sprite.patch_settings({ mode })}
            options={[
              { value: GridMode.GRID, label: "Columns × rows" },
              { value: GridMode.SIZE, label: "Frame size" },
            ]}
          />
          {#if sprite.settings.mode === GridMode.GRID}
            <div class="grid grid-cols-2 gap-2">
              <SpriteNumberField label="Columns" min={1} value={sprite.settings.columns} onchange={(v) => sprite.patch_settings({ columns: Math.max(1, v) })} />
              <SpriteNumberField label="Rows" min={1} value={sprite.settings.rows} onchange={(v) => sprite.patch_settings({ rows: Math.max(1, v) })} />
            </div>
          {:else}
            <div class="grid grid-cols-2 gap-2">
              <SpriteNumberField label="Width" min={1} value={sprite.settings.frame_width} onchange={(v) => sprite.patch_settings({ frame_width: Math.max(1, v) })} />
              <SpriteNumberField label="Height" min={1} value={sprite.settings.frame_height} onchange={(v) => sprite.patch_settings({ frame_height: Math.max(1, v) })} />
            </div>
          {/if}
          <p class="text-ui text-foreground/65">Padding, the outer margin in px</p>
          <div class="grid grid-cols-4 gap-2">
            <SpriteNumberField label="Left" min={0} value={sprite.settings.padding.left} onchange={(v) => sprite.set_padding("left", v)} />
            <SpriteNumberField label="Right" min={0} value={sprite.settings.padding.right} onchange={(v) => sprite.set_padding("right", v)} />
            <SpriteNumberField label="Top" min={0} value={sprite.settings.padding.top} onchange={(v) => sprite.set_padding("top", v)} />
            <SpriteNumberField label="Bottom" min={0} value={sprite.settings.padding.bottom} onchange={(v) => sprite.set_padding("bottom", v)} />
          </div>
          <p class="text-ui text-foreground/65">Spacing, the gap between frames in px</p>
          <div class="grid grid-cols-2 gap-2">
            <SpriteNumberField label="X" min={0} value={sprite.settings.spacing.x} onchange={(v) => sprite.set_spacing("x", v)} />
            <SpriteNumberField label="Y" min={0} value={sprite.settings.spacing.y} onchange={(v) => sprite.set_spacing("y", v)} />
          </div>
          <p class="font-mono text-2xs text-foreground/65 tabular-nums">
            {grid.columns.length} × {grid.rows.length} = {grid.frames.length} frames
            {#if grid.columns[0] && grid.rows[0]}
              · {Math.round(grid.columns[0].end - grid.columns[0].start)}×{Math.round(grid.rows[0].end - grid.rows[0].start)} px
            {/if}
          </p>
          <Button size="sm" title="Snap every dragged line back to the even grid" disabled={!has_line_overrides} onclick={() => sprite.reset_lines()}>
            <ColumnsIcon weight="bold" /> Reset lines
          </Button>
        </Section>

        <!-- On touch the sheet sits above this column, so the frame controls come first, right under it. -->
        <Section title={sprite.selected === null ? "Frame" : `Frame #${sprite.selected}`} class="pointer-coarse:order-first" flush>
          {#if selected_frame && sprite.selected !== null}
            {@const index = sprite.selected}
            <div class="grid grid-cols-2 gap-2">
              <SpriteNumberField label="X" value={selected_frame.x} onchange={(v) => sprite.set_frame_rect(index, { ...selected_frame, x: v })} />
              <SpriteNumberField label="Y" value={selected_frame.y} onchange={(v) => sprite.set_frame_rect(index, { ...selected_frame, y: v })} />
              <SpriteNumberField label="Width" min={1} value={selected_frame.w} onchange={(v) => sprite.set_frame_rect(index, { ...selected_frame, w: Math.max(1, v) })} />
              <SpriteNumberField label="Height" min={1} value={selected_frame.h} onchange={(v) => sprite.set_frame_rect(index, { ...selected_frame, h: Math.max(1, v) })} />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <Button size="sm" title="Shrink to the visible pixels (C)" onclick={() => sprite.fit_frame_to_content(index)}><CrosshairIcon weight="bold" /> Fit content</Button>
              <Button size="sm" title="Back to the grid cell (R)" disabled={!sprite.overrides.frames[index]} onclick={() => sprite.reset_frame(index)}>
                <ArrowCounterClockwiseIcon weight="bold" /> Reset
              </Button>
            </div>
            <Button size="sm" title="Toggle the frame in the sequence (Del)" onclick={() => sprite.toggle_in_sequence(index)}>
              {#if selected_included}<EyeSlashIcon weight="bold" /> Exclude from sequence{:else}<EyeIcon weight="bold" /> Include in sequence{/if}
            </Button>
            <p class="text-ui text-foreground/65 pointer-coarse:hidden">Arrows move, Shift ×10, Alt+arrows resize.</p>
          {:else}
            <p class="text-ui text-foreground/65 pointer-coarse:hidden">Click a frame on the sheet to adjust it. Drag it or its handles, or use the arrow keys.</p>
            <p class="hidden text-ui text-foreground/65 pointer-coarse:block">
              Tap a frame on the sheet to adjust it, then drag it or its handles. Hold a frame to include or exclude it. Pinch to zoom.
            </p>
          {/if}
          <Button size="sm" title="Shrink every frame to its visible pixels. Breaks alignment, so export with a uniform size and an anchor" onclick={() => sprite.fit_all_to_content()}>
            <CrosshairIcon weight="bold" /> Fit all to content
          </Button>
        </Section>

        <Section title="Export" description="Both include a JSON file with the source rects and order." flush>
          <label class="flex flex-col gap-1" title="Where a smaller frame sits inside the cell">
            <span class="text-2xs text-foreground/65">Anchor</span>
            <Select size="sm" bind:value={sprite.anchor} options={ANCHORS} />
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-ui select-none">
            <Checkbox bind:checked={sprite.uniform} />
            Same size for every frame
          </label>
          <SpriteNumberField
            label="Sheet columns"
            title="Columns in the repacked sheet. 0 keeps the source grid's"
            min={0}
            placeholder={String(grid.columns.length)}
            value={sheet_columns}
            onchange={(v) => (sheet_columns = Math.max(0, v))}
          />
          <Button variant="primary" size="sm" disabled={!sprite.sequence.length || !!exporting} onclick={save_frames}>
            <FloppyDiskIcon weight="bold" /> Save frames…
          </Button>
          <Button size="sm" disabled={!sprite.sequence.length || !!exporting} onclick={save_sheet}>
            <FloppyDiskIcon weight="bold" /> Save clean sheet…
          </Button>
        </Section>
      </aside>

      <!-- The sheet takes every touch on it, so it never fills the column: there's always room below to scroll by. -->
      <div class="stage relative order-1 h-[clamp(12rem,60cqh,32rem)] shrink-0 @4xl:order-none @4xl:h-auto">
        <SpriteSheet bind:this={sheet} bind:zoom {sprite} {show_labels} pan_mode={space_held} />
      </div>

      <aside class="order-3 flex flex-col gap-6 p-4 @4xl:order-none @4xl:overflow-y-auto @4xl:border-l @4xl:border-foreground/8">
        <Section title="Preview" flush>
          <SpritePreview bind:this={preview} {sprite} />
          <SpriteNumberField label="FPS" min={1} max={120} value={sprite.fps} onchange={(v) => (sprite.fps = Math.max(1, Math.min(120, v)))} />
        </Section>

        <Section title="Sequence ({sprite.sequence.length})" flush>
          <div class="grid grid-cols-3 gap-1">
            <Button size="sm" title="Row by row" onclick={() => sprite.reset_sequence("row")}><RowsIcon weight="bold" /> Rows</Button>
            <Button size="sm" title="Column by column" onclick={() => sprite.reset_sequence("column")}><ColumnsIcon weight="bold" /> Cols</Button>
            <Button size="sm" title="Reverse the current order" disabled={!sprite.sequence.length} onclick={() => sprite.reverse_sequence()}>
              <ArrowsDownUpIcon weight="bold" /> Rev
            </Button>
          </div>
          <label class="flex flex-col gap-1" title={'Frame indices, like "0-7, 9, 15-8". Ranges are inclusive and can run backwards.'}>
            <span class={cn("text-2xs", sequence_valid ? "text-foreground/65" : "text-error")}>{sequence_valid ? "Order" : "Order: not a valid list of frames"}</span>
            <Input
              size="sm"
              class={cn("font-mono", !sequence_valid && "ring-2 ring-error hover:ring-error")}
              spellcheck={false}
              aria-invalid={!sequence_valid}
              value={sequence_text}
              oninput={(event) => {
                const text = event.currentTarget.value;
                sequence_draft = text;
                const parsed = parse_sequence(text, grid.frames.length);
                if (parsed) sprite.sequence = parsed;
              }}
              onblur={() => (sequence_draft = null)}
            />
          </label>
          <SpriteFilmstrip {sprite} />
        </Section>
      </aside>
    </div>

    <StatusBar>
      {#if exporting}
        <span class="flex items-center gap-1.5 text-foreground"><Spinner label="Saving" /> Saving {exporting.done} of {exporting.total}</span>
      {/if}
      <span>{grid.frames.length} frames</span>
      <span>{sprite.sequence.length} in sequence</span>
      <span class="ml-auto hidden truncate @3xl:block pointer-coarse:@3xl:hidden">Drag lines · click a frame · drag it or its handles · double-click to toggle · Space or Alt drag to pan · Ctrl+scroll to zoom</span>
      <span class="ml-auto hidden truncate pointer-coarse:@3xl:block">Drag lines · tap a frame · drag it or its handles · hold to toggle · pinch to zoom</span>
    </StatusBar>
  {/if}
</div>

<style>
  .stage {
    background: var(--background-darker);
  }
</style>

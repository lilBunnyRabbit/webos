<script lang="ts">
  import kernel, {
    NotificationType,
    Platform,
    ShortcutCategory,
    type AppsService,
    type DialogsService,
    type NotificationsService,
    type ShortcutsService,
  } from "$lib/core/api";
  import { Button, IconButton, ResizeHandle, Separator, Spinner, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { base_name, file_stem, parent_path } from "$lib/core/api/services/files/path";
  import { error_message } from "$lib/core/utils";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    CaretDown as CaretDownIcon,
    CornersOut as CornersOutIcon,
    Export as ExportIcon,
    FilePlus as FilePlusIcon,
    FlipHorizontal as FlipHorizontalIcon,
    FlipVertical as FlipVerticalIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    GridFour as GridFourIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    Resize as ResizeIcon,
    SquaresFour as SquaresFourIcon,
  } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import { z } from "zod";
  import { palette_rgba } from "./color";
  import { insert_frame, transform_sprite, Transform } from "./document";
  import { Editor } from "./editor.svelte";
  import { write_animated_svg, write_frame_svg, write_gif } from "./export";
  import { EXTENSION, serialize_sprite } from "./format";
  import HopspriteLayers from "./hopsprite-layers.svelte";
  import HopspriteExportPopover, { type ExportRequest } from "./hopsprite-export-popover.svelte";
  import HopspriteNewPopover from "./hopsprite-new-popover.svelte";
  import HopspriteColorPopover from "./hopsprite-color-popover.svelte";
  import HopspriteOptions from "./hopsprite-options.svelte";
  import HopspriteSizePopover from "./hopsprite-size-popover.svelte";
  import HopspriteStage from "./hopsprite-stage.svelte";
  import HopspriteStrip from "./hopsprite-strip.svelte";
  import HopspriteSwatches from "./hopsprite-swatches.svelte";
  import HopspriteToolbox from "./hopsprite-toolbox.svelte";
  import HopspriteWells from "./hopsprite-wells.svelte";
  import { read_path, sprite_name_for, write_text, type Opened } from "./io";
  import { below } from "./menu";
  import { create_sprite, Direction, type Point } from "./model";
  import { DEFAULT_PRESET, preset_by_id } from "./palettes";
  import { create_prefs, MAX_BRUSH, SIDE, STRIP, type Panel } from "./prefs";
  import { frame_sequence, full_range, PlayMode } from "./sequence";
  import { Tool, TOOL_KEYS, TOOL_LABELS, TOOLS, type ToolSettings } from "./tools";
  import { Viewport } from "./viewport.svelte";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const prefs = create_prefs(storage);
  const range = storage.window("range", -1, z.number().int().min(-1));

  const editor = new Editor(create_sprite(32, 32, DEFAULT_PRESET.colors));
  const viewport = new Viewport();
  const popover = $props.id();

  let file_path = $state<string | null>(null);
  let untitled = $state(`Untitled${EXTENSION}`);
  let loading = $state(false);
  let cursor = $state<Point | null>(null);
  let playing = $state(false);

  const file_name = $derived(file_path ? base_name(file_path) : untitled);
  const read_only = $derived(file_path !== null && is_system_path(file_path));
  const sprite = $derived(editor.sprite);

  const settings = $derived<ToolSettings>({
    tool: prefs.tool.value,
    size: prefs.size.value,
    shape: prefs.shape.value,
    pixel_perfect: prefs.pixel_perfect.value,
    pattern: prefs.pattern.value,
    contiguous: prefs.contiguous.value,
    filled: prefs.filled.value,
    mirror_x: prefs.mirror_x.value,
    mirror_y: prefs.mirror_y.value,
  });

  $effect(() => win.set_title(file_name));
  $effect(() => win.set_dirty(editor.dirty, { save }));

  $effect(() => {
    const tool = prefs.tool.value;
    untrack(() => {
      if (tool !== Tool.MOVE && tool !== Tool.SELECT && tool !== Tool.WAND && tool !== Tool.HAND) editor.drop();
    });
  });

  $effect(() => {
    if (!editor.notice) return;
    const timer = setTimeout(() => (editor.notice = null), 3000);
    return () => clearTimeout(timer);
  });

  async function discard_ok(): Promise<boolean> {
    return !editor.dirty || confirm_discard(win, file_name);
  }

  function report(title: string, reason: unknown) {
    notifications.notify(app_id, { type: NotificationType.ERROR, title, message: error_message(reason) });
  }

  let open_request = 0;

  async function load(task: () => Promise<Opened>, path: string | null, name: string) {
    const id = ++open_request;
    loading = true;
    playing = false;
    try {
      const opened = await task();
      if (id !== open_request) return;
      editor.load(opened.sprite, !opened.imported);
      file_path = opened.imported ? null : path;
      untitled = sprite_name_for(name);
      range.value = -1;
      if (opened.approximated) {
        notifications.notify(app_id, {
          type: NotificationType.WARNING,
          title: "Some colours were approximated",
          message: `${opened.approximated} colours didn't fit in 255 and use their nearest palette colour.`,
        });
      }
    } catch (reason) {
      if (id === open_request) report(`Couldn't open ${name}`, reason);
    } finally {
      if (id === open_request) loading = false;
    }
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({
      accept: [EXTENSION, "image/*"],
      start_path: file_path ? parent_path(file_path) : undefined,
      title: "Open in Hopsprite",
    });
    if (chosen) await load(() => read_path(chosen), chosen, base_name(chosen));
  }

  async function create(width: number, height: number, preset: string) {
    if (!(await discard_ok())) return;
    playing = false;
    editor.load(create_sprite(width, height, preset_by_id(preset).colors), false);
    file_path = null;
    untitled = `Untitled${EXTENSION}`;
    range.value = -1;
  }

  async function write(path: string): Promise<boolean> {
    editor.drop();
    const snapshot = editor.sprite;
    try {
      await write_text(path, serialize_sprite(snapshot));
      file_path = path;
      editor.mark_saved(snapshot);
      notifications.notify(app_id, { title: "Sprite saved", message: path });
      return true;
    } catch (reason) {
      report("Couldn't save the sprite", reason);
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const path = await win.pick_save({
      name: sprite_name_for(file_name),
      accept: [EXTENSION],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
      title: "Save sprite",
    });
    if (!path) return false;
    return write(path.toLowerCase().endsWith(EXTENSION) ? path : `${path}${EXTENSION}`);
  }

  function save(): Promise<boolean> {
    return file_path && !read_only ? write(file_path) : save_as();
  }

  async function export_file(request: ExportRequest) {
    editor.drop();
    playing = false;
    const gif = request.format === "gif";
    const extension = gif ? ".gif" : ".svg";
    const path = await win.pick_save({
      name: `${file_stem(file_name) || "sprite"}${extension}`,
      accept: gif ? [".gif", "image/gif"] : [".svg", "image/svg+xml"],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
      title: `Export ${request.kind === "frame" ? "frame" : "animation"} as ${gif ? "GIF" : "SVG"}`,
    });
    if (!path) return;
    const target = path.toLowerCase().endsWith(extension) ? path : `${path}${extension}`;
    const snapshot = editor.sprite;
    if (gif) {
      const order = request.kind === "animation" ? frame_sequence(request.range, request.direction) : [editor.frame];
      await write_gif(app_id, target, snapshot, { scale: request.scale, order, loop: request.kind === "animation" && request.loop });
      return;
    }
    if (request.kind === "animation") {
      await write_animated_svg(app_id, target, snapshot, request);
      return;
    }
    try {
      await write_frame_svg(target, snapshot, editor.frame, request.scale);
      notifications.notify(app_id, {
        title: "Frame exported",
        message: target,
        actions: [{ label: "Open", on_click: () => void apps.open(target) }],
      });
    } catch (reason) {
      report("Couldn't export the SVG", reason);
    }
  }

  const TILE_SIZES = [0, 8, 16, 32];

  async function file_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      [
        { id: "new", label: "New sprite…", icon: FilePlusIcon },
        { id: "open", label: "Open…", icon: FolderOpenIcon, shortcut: "Mod+O" },
        { id: "save", label: "Save", icon: FloppyDiskIcon, shortcut: "Mod+S" },
        { id: "save-as", label: "Save as…", icon: FloppyDiskBackIcon, shortcut: "Mod+Shift+S" },
        { separator: true },
        { id: "size", label: "Sprite size…", icon: ResizeIcon },
        {
          label: "Flip and rotate",
          icon: ArrowClockwiseIcon,
          items: [
            { id: Transform.FLIP_H, label: "Flip horizontally", icon: FlipHorizontalIcon },
            { id: Transform.FLIP_V, label: "Flip vertically", icon: FlipVerticalIcon },
            { separator: true },
            { id: Transform.ROTATE_CW, label: "Rotate 90° right", icon: ArrowClockwiseIcon },
            { id: Transform.ROTATE_CCW, label: "Rotate 90° left", icon: ArrowCounterClockwiseIcon },
          ],
        },
        {
          label: "Tile grid",
          icon: SquaresFourIcon,
          items: TILE_SIZES.map((size) => ({ id: `tile:${size}`, label: `${size ? `${size} px` : "Off"}${prefs.tile.value === size ? " ✓" : ""}` })),
        },
      ],
      { anchor: below(event) }
    );
    if (!choice) return;
    if (choice === "new") document.getElementById(`new-${popover}`)?.showPopover();
    else if (choice === "open") void open();
    else if (choice === "save") void save();
    else if (choice === "save-as") void save_as();
    else if (choice === "size") document.getElementById(`size-${popover}`)?.showPopover();
    else if (choice.startsWith("tile:")) prefs.tile.value = Number(choice.slice(5));
    else {
      editor.apply((value) => transform_sprite(value, choice as Transform));
      editor.selection = null;
    }
  }

  let root = $state<HTMLElement>();
  let palette_in_popover = $state(false);

  const side_size = $derived(prefs.side.value.collapsed ? SIDE.rest : prefs.side.value.size);
  const strip_size = $derived(prefs.strip.value.collapsed ? STRIP.rest : prefs.strip.value.size);

  function preview_panel(variable: string, size: number) {
    root?.style.setProperty(variable, `${size}px`);
  }

  function commit_panel(box: { value: Panel }, size: number, collapsed: boolean) {
    box.value = { size, collapsed };
  }

  function toggle_play() {
    if (playing) return void (playing = false);
    if (sprite.frames.length < 2) return;
    editor.drop();
    editor.cancel();
    playing = true;
  }

  $effect(() => {
    if (!playing || !win.is_visible) return;
    const current = editor.sprite;
    const tag = range.value >= 0 ? current.tags[range.value] : undefined;
    const mode = prefs.play_mode.value;
    const direction = tag ? (tag.direction === Direction.FORWARD && mode === PlayMode.PINGPONG ? Direction.PINGPONG : tag.direction) : mode === PlayMode.PINGPONG ? Direction.PINGPONG : Direction.FORWARD;
    const order = frame_sequence(tag ? { from: tag.from, to: tag.to } : full_range(current), direction);
    let step = Math.max(0, order.indexOf(untrack(() => editor.frame)));
    editor.frame = order[step];
    let elapsed = 0;
    let last = performance.now();
    let frame_request = 0;

    const tick = (now: number) => {
      elapsed += now - last;
      last = now;
      let duration = current.frames[order[step]]?.duration ?? 100;
      while (elapsed >= duration) {
        elapsed -= duration;
        step++;
        if (step >= order.length) {
          if (mode === PlayMode.ONCE) {
            playing = false;
            return;
          }
          step = 0;
        }
        duration = current.frames[order[step]]?.duration ?? 100;
      }
      editor.frame = order[step];
      frame_request = requestAnimationFrame(tick);
    };
    frame_request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame_request);
  });

  function step_size(delta: number) {
    prefs.size.value = Math.min(MAX_BRUSH, Math.max(1, prefs.size.value + delta));
  }

  function selection_or(fallback: () => void, action: () => void) {
    return () => (editor.outline ? action() : fallback());
  }

  function paste() {
    if (editor.paste()) prefs.tool.value = Tool.MOVE;
  }

  onMount(() => {
    const path = untrack(() => initial_path);
    if (path) void load(() => read_path(path), path, base_name(path));
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `hopsprite.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", () => editor.undo()),
      scoped("redo", "mod+shift+z", "Redo", () => editor.redo()),
      scoped("redo-alt", "mod+y", "Redo", () => editor.redo()),
      scoped("open", "mod+o", "Open…", open),
      scoped("save", "mod+s", "Save", save),
      scoped("save-as", "mod+shift+s", "Save as…", save_as),
      scoped("swap", "x", "Swap colours", () => ([editor.primary, editor.secondary] = [editor.secondary, editor.primary])),
      scoped("play", "enter", "Drop moved pixels, or play and pause", () => (editor.floating ? editor.drop() : toggle_play())),
      scoped("prev", ",", "Previous frame", () => editor.set_frame(editor.frame - 1)),
      scoped("next", ".", "Next frame", () => editor.set_frame(editor.frame + 1)),
      scoped("new-frame", "alt+n", "New frame", () => {
        editor.apply((value) => insert_frame(value, editor.frame, false));
        editor.set_frame(editor.frame + 1);
      }),
      scoped("copy-frame", "alt+d", "Duplicate frame", () => {
        editor.apply((value) => insert_frame(value, editor.frame, true));
        editor.set_frame(editor.frame + 1);
      }),
      scoped("select-all", "mod+a", "Select all", () => editor.select_all()),
      scoped("deselect", "mod+d", "Deselect", () => editor.deselect()),
      scoped("invert", "mod+shift+i", "Invert selection", () => editor.invert_selection()),
      scoped("copy", "mod+c", "Copy", () => editor.copy()),
      scoped("cut", "mod+x", "Cut", () => editor.cut()),
      scoped("paste", "mod+v", "Paste", paste),
      scoped("delete", "delete", "Delete selected pixels", () => editor.delete_selection()),
      scoped("delete-alt", "backspace", "Delete selected pixels", () => editor.delete_selection()),
      scoped("escape", "esc", "Cancel or deselect", () => (editor.floating ? editor.cancel_float() : editor.deselect())),
      scoped("flip-h", "shift+h", "Flip horizontally", () => editor.transform_selection(Transform.FLIP_H)),
      scoped("flip-v", "shift+v", "Flip vertically", () => editor.transform_selection(Transform.FLIP_V)),
      scoped("smaller", "shift+,", "Smaller brush", () => step_size(-1)),
      scoped("bigger", "shift+.", "Bigger brush", () => step_size(1)),
      scoped("left", "left", "Nudge left or previous frame", selection_or(() => editor.set_frame(editor.frame - 1), () => editor.nudge(-1, 0))),
      scoped("right", "right", "Nudge right or next frame", selection_or(() => editor.set_frame(editor.frame + 1), () => editor.nudge(1, 0))),
      scoped("up", "up", "Nudge up", selection_or(() => {}, () => editor.nudge(0, -1))),
      scoped("down", "down", "Nudge down", selection_or(() => {}, () => editor.nudge(0, 1))),
      scoped("fit", "mod+0", "Fit to window", () => viewport.fit(sprite.width, sprite.height)),
      ...TOOLS.map((item) => scoped(`tool.${item}`, TOOL_KEYS[item], TOOL_LABELS[item], () => (prefs.tool.value = item))),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  const cursor_index = $derived.by(() => {
    if (!cursor || cursor.x < 0 || cursor.y < 0 || cursor.x >= sprite.width || cursor.y >= sprite.height) return null;
    return editor.index_at(cursor);
  });

  const primary_rgba = $derived.by(() => {
    const table = palette_rgba(editor.display.palette);
    const i = editor.primary * 4;
    return `rgb(${table[i]} ${table[i + 1]} ${table[i + 2]} / ${table[i + 3] / 255})`;
  });
</script>

<div
  bind:this={root}
  class={["hopsprite bg-background", !prefs.side.value.collapsed && "side-open"]}
  style:--side="{side_size}px"
  style:--strip="{strip_size}px"
>
  <Toolbar class="area-bar flex-nowrap gap-1">
    {#if kernel.platform === Platform.MOBILE}
      <Button
        size="sm"
        variant="quiet"
        class="max-w-32 min-w-0 shrink-[1000] gap-1 pr-1.5"
        aria-label="File: {file_name}{editor.dirty ? ', unsaved changes' : ''}"
        title={file_path ?? "Not saved yet"}
        style="anchor-name: --file-{popover}"
        onclick={file_menu}
      >
        <span class="min-w-0 truncate font-medium">{file_stem(file_name)}</span>
        {#if editor.dirty}<span class="size-2 shrink-0 rounded-full bg-primary"></span>{/if}
        <CaretDownIcon weight="bold" class="size-3 shrink-0 opacity-65" />
      </Button>
    {:else}
      <Button size="sm" variant="quiet" class="shrink-0 gap-1 pr-1.5" style="anchor-name: --file-{popover}" onclick={file_menu}>
        File<CaretDownIcon weight="bold" class="size-3 opacity-65" />
      </Button>
    {/if}
    <IconButton label="Undo (Mod+Z)" size="sm" class="shrink-0" disabled={!editor.undoable} onclick={() => editor.undo()}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
    <IconButton label="Redo (Mod+Shift+Z)" size="sm" class="shrink-0" disabled={!editor.redoable} onclick={() => editor.redo()}><ArrowClockwiseIcon weight="bold" /></IconButton>
    <Separator vertical />
    <div
      class={["options flex min-w-0 items-center gap-1 overflow-x-auto [&>*]:shrink-0", kernel.platform === Platform.MOBILE ? "flex-auto" : "flex-1"]}
      role="group"
      aria-label="{TOOL_LABELS[prefs.tool.value]} options"
    >
      <span class="hidden shrink-0 pr-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase @2xl:inline">{TOOL_LABELS[prefs.tool.value]}</span>
      <HopspriteOptions {editor} {prefs} />
    </div>
    <Button size="sm" class="shrink-0" popovertarget="export-{popover}" style="anchor-name: --export-{popover}">
      <ExportIcon weight="bold" /><span class="hidden @md:inline">Export</span>
    </Button>
  </Toolbar>

  <div class="area-tools border-r border-foreground/8 bg-background-light p-1">
    <HopspriteToolbox bind:tool={prefs.tool.value} />
  </div>

  <div class="area-stage relative grid min-h-0 min-w-0">
    <HopspriteStage
      {editor}
      {viewport}
      {settings}
      onion={prefs.onion.value}
      grid={prefs.grid.value}
      tile={prefs.tile.value}
      {playing}
      visible={win.is_visible}
      bind:cursor
    />
    {#if loading}
      <div class="absolute inset-0 grid place-items-center bg-background-darker/70"><Spinner label="Opening sprite" /></div>
    {/if}
    {#if editor.notice}
      <div class="pointer-events-none absolute inset-x-0 top-3 flex justify-center" aria-live="polite">
        <span class="rounded-full bg-background-lighter px-3 py-1 text-ui shadow-popover">{editor.notice}</span>
      </div>
    {/if}
    <div class="info pointer-events-none absolute bottom-2 left-2 hidden rounded-md bg-background-light/85 px-2 py-1 font-mono text-2xs text-foreground/80 tabular-nums shadow-raised @md:block">
      {sprite.width}×{sprite.height}{cursor_index !== null && cursor ? ` · ${cursor.x}, ${cursor.y}` : ""}
    </div>
    <div class="absolute right-2 bottom-2 flex items-center gap-0.5 rounded-lg bg-background-light/90 p-0.5 shadow-popover" role="group" aria-label="View">
      <IconButton label="Pixel grid" size="sm" pressed={prefs.grid.value} onclick={() => (prefs.grid.value = !prefs.grid.value)}><GridFourIcon weight="bold" /></IconButton>
      <span class="hidden @sm:contents">
        <IconButton label="Zoom out" size="sm" onclick={() => viewport.step(-1)}><MagnifyingGlassMinusIcon weight="bold" /></IconButton>
        <button type="button" class="h-7 w-12 rounded-md text-center font-mono text-2xs text-foreground/80 tabular-nums hover:bg-foreground/8" title="Actual size" onclick={() => viewport.zoom_to(1)}>
          {Math.round(viewport.zoom * 100)}%
        </button>
        <IconButton label="Zoom in" size="sm" onclick={() => viewport.step(1)}><MagnifyingGlassPlusIcon weight="bold" /></IconButton>
      </span>
      <IconButton label="Fit to window (Mod+0)" size="sm" pressed={viewport.fitted} onclick={() => viewport.fit(sprite.width, sprite.height)}><CornersOutIcon weight="bold" /></IconButton>
    </div>
  </div>

  <div class="area-side-handle">
    <ResizeHandle
      axis="column"
      label="Colour panel width"
      size={prefs.side.value.size}
      min={SIDE.min}
      max={SIDE.max}
      rest={SIDE.rest}
      collapsed={prefs.side.value.collapsed}
      onpreview={(size) => preview_panel("--side", size)}
      oncommit={(size, collapsed) => commit_panel(prefs.side, size, collapsed)}
    />
  </div>

  <aside class="area-side @container flex min-h-0 flex-col gap-2.5 overflow-hidden bg-background-light p-2" aria-label="Colours">
    <div class="flex items-center gap-2">
      <HopspriteWells {editor} popover="color-{popover}" anchor="--wells-{popover}" onopen={() => (palette_in_popover = false)} />
      <span class="side-wide min-w-0 truncate font-mono text-2xs text-foreground/80 tabular-nums">
        {editor.primary === 0 ? "Transparent" : sprite.palette[editor.primary]?.slice(1, 7).toUpperCase()}
      </span>
    </div>
    <HopspriteSwatches {editor} class="min-h-12 shrink overflow-y-auto p-0.5" />
    <HopspriteLayers {editor} class="side-wide min-h-28 flex-1 border-t border-foreground/8 pt-2" />
  </aside>

  <div class="area-strip-handle">
    <ResizeHandle
      axis="row"
      label="Frames height"
      size={prefs.strip.value.size}
      min={STRIP.min}
      max={STRIP.max}
      rest={STRIP.rest}
      collapsed={prefs.strip.value.collapsed}
      onpreview={(size) => preview_panel("--strip", size)}
      oncommit={(size, collapsed) => commit_panel(prefs.strip, size, collapsed)}
    />
  </div>

  <div class="area-strip min-h-0">
    <HopspriteStrip {editor} {playing} mode={prefs.play_mode} {range} onion={prefs.onion} ontoggleplay={toggle_play} />
  </div>

  <div class="area-dock items-center gap-2 border-t border-foreground/8 bg-background-light px-2 py-1.5">
    <HopspriteWells {editor} size="sm" popover="color-{popover}" anchor="--dock-wells-{popover}" onopen={() => (palette_in_popover = true)} />
    <Separator vertical />
    <div class="min-w-0 flex-1"><HopspriteToolbox bind:tool={prefs.tool.value} /></div>
  </div>
</div>

<HopspriteNewPopover id="new-{popover}" anchor="--file-{popover}" oncreate={create} />
<HopspriteSizePopover id="size-{popover}" anchor="--file-{popover}" {editor} />
<HopspriteExportPopover id="export-{popover}" anchor="--export-{popover}" {editor} onexport={export_file} />
<HopspriteColorPopover
  id="color-{popover}"
  anchor={palette_in_popover ? `--dock-wells-${popover}` : `--wells-${popover}`}
  {editor}
  with_palette={palette_in_popover}
/>

<style>
  .hopsprite {
    container-type: size;
    display: grid;
    height: 100%;
    min-height: 0;
    --side-size: min(var(--side), 40cqw);
    --strip-size: max(2.75rem, min(var(--strip), 30cqh));
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto var(--strip-size) auto;
    grid-template-areas: "bar" "stage" "strip-handle" "strip" "dock";
  }

  .hopsprite :global(.area-bar) {
    grid-area: bar;
  }

  .area-tools {
    grid-area: tools;
    display: none;
  }

  .area-stage {
    grid-area: stage;
  }

  .area-side-handle,
  .area-side {
    display: none;
  }

  .area-strip-handle {
    grid-area: strip-handle;
  }

  .area-strip {
    grid-area: strip;
  }

  .area-dock {
    grid-area: dock;
    display: flex;
  }

  .options {
    scrollbar-width: none;
  }

  @container (height < 45rem) {
    .hopsprite {
      --strip-size: max(2.75rem, min(var(--strip), 18cqh));
    }
  }

  @container (height < 34rem) {
    .hopsprite {
      --strip-size: max(2.75rem, min(var(--strip), 11cqh));
    }
  }

  @container (width >= 40rem) {
    .hopsprite {
      grid-template-columns: auto minmax(0, 1fr) auto var(--side-size);
      grid-template-rows: auto minmax(0, 1fr) auto var(--strip-size);
      grid-template-areas:
        "bar bar bar bar"
        "tools stage side-handle side"
        "strip-handle strip-handle strip-handle strip-handle"
        "strip strip strip strip";
    }

    .area-tools {
      display: block;
    }

    .area-side-handle {
      grid-area: side-handle;
      display: flex;
    }

    .area-side {
      grid-area: side;
      display: flex;
    }

    .area-dock {
      display: none;
    }

    .side-open :global(.strip-layers) {
      display: none;
    }
  }

  @container (width < 9rem) {
    :global(.side-wide) {
      display: none;
    }
  }
</style>

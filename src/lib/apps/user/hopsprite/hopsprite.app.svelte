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
  import { Button, IconButton, Segmented, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { base_name, file_stem, parent_path } from "$lib/core/api/services/files/path";
  import { error_message } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    CaretDown as CaretDownIcon,
    CaretUp as CaretUpIcon,
    CornersOut as CornersOutIcon,
    Devices as DevicesIcon,
    DotsThree as DotsThreeIcon,
    Export as ExportIcon,
    FilePlus as FilePlusIcon,
    FlipHorizontal as FlipHorizontalIcon,
    FlipVertical as FlipVerticalIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    Resize as ResizeIcon,
  } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import { z } from "zod";
  import { palette_rgba } from "./color";
  import { insert_frame, transform_sprite, Transform } from "./document";
  import { Editor } from "./editor.svelte";
  import { write_animated_svg, write_frame_svg } from "./export";
  import { EXTENSION, serialize_sprite } from "./format";
  import HopspriteExportPopover, { type ExportRequest } from "./hopsprite-export-popover.svelte";
  import HopspriteNewPopover from "./hopsprite-new-popover.svelte";
  import HopspriteOptions from "./hopsprite-options.svelte";
  import HopspritePalette from "./hopsprite-palette.svelte";
  import HopspriteSizePopover from "./hopsprite-size-popover.svelte";
  import HopspriteStage from "./hopsprite-stage.svelte";
  import HopspriteTimeline from "./hopsprite-timeline.svelte";
  import HopspriteToolbox from "./hopsprite-toolbox.svelte";
  import { read_file, read_path, sprite_name_for, write_text, type Opened } from "./io";
  import { below } from "./menu";
  import { create_sprite, Direction, type Point } from "./model";
  import { DEFAULT_PRESET, preset_by_id } from "./palettes";
  import { create_prefs, MAX_BRUSH } from "./prefs";
  import { frame_sequence, full_range, PlayMode } from "./sequence";
  import { paints, Tool, TOOL_KEYS, TOOL_LABELS, TOOLS, type ToolSettings } from "./tools";
  import { Viewport } from "./viewport.svelte";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const prefs = create_prefs(storage);
  const panel = storage.window<"palette" | "timeline">("panel", "palette", z.enum(["palette", "timeline"]));
  const range = storage.window("range", -1, z.number().int().min(-1));
  const panel_open = storage.window("panel_open", true, z.boolean());

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
      accept: [EXTENSION, "image/png", "image/gif", ".png", ".gif"],
      start_path: file_path ? parent_path(file_path) : undefined,
      title: "Open in Hopsprite",
    });
    if (chosen) await load(() => read_path(chosen), chosen, base_name(chosen));
  }

  async function open_device() {
    if (!(await discard_ok())) return;
    const [file] = await pick_device_files({ accept: [EXTENSION, "image/png", "image/gif", "image/*"] });
    if (file) await load(() => read_file(file), null, file.name);
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

  async function export_svg(request: ExportRequest) {
    editor.drop();
    playing = false;
    const path = await win.pick_save({
      name: `${file_stem(file_name) || "sprite"}.svg`,
      accept: [".svg", "image/svg+xml"],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
      title: request.kind === "frame" ? "Export frame as SVG" : "Export animation as SVG",
    });
    if (!path) return;
    const target = path.toLowerCase().endsWith(".svg") ? path : `${path}.svg`;
    const snapshot = editor.sprite;
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

  async function sprite_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      [
        { id: Transform.FLIP_H, label: "Flip horizontally", icon: FlipHorizontalIcon },
        { id: Transform.FLIP_V, label: "Flip vertically", icon: FlipVerticalIcon },
        { separator: true },
        { id: Transform.ROTATE_CW, label: "Rotate 90° right", icon: ArrowClockwiseIcon },
        { id: Transform.ROTATE_CCW, label: "Rotate 90° left", icon: ArrowCounterClockwiseIcon },
      ],
      { anchor: below(event) }
    );
    if (!choice) return;
    editor.apply((value) => transform_sprite(value, choice as Transform));
    editor.selection = null;
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
    return editor.cel()[cursor.y * sprite.width + cursor.x];
  });

  const primary_rgba = $derived.by(() => {
    const table = palette_rgba(editor.display.palette);
    const i = editor.primary * 4;
    return `rgb(${table[i]} ${table[i + 1]} ${table[i + 2]} / ${table[i + 3] / 255})`;
  });
</script>

{#snippet zoom_controls()}
  <IconButton label="Zoom out" size="sm" onclick={() => viewport.step(-1)}><MagnifyingGlassMinusIcon weight="bold" /></IconButton>
  <button type="button" class="w-12 rounded-md py-1 text-center font-mono text-2xs text-foreground/80 tabular-nums hover:bg-foreground/8" title="Actual size" onclick={() => viewport.zoom_to(1)}>
    {Math.round(viewport.zoom * 100)}%
  </button>
  <IconButton label="Zoom in" size="sm" onclick={() => viewport.step(1)}><MagnifyingGlassPlusIcon weight="bold" /></IconButton>
  <IconButton label="Fit to window (Mod+0)" size="sm" onclick={() => viewport.fit(sprite.width, sprite.height)}><CornersOutIcon weight="bold" /></IconButton>
{/snippet}

<div class="hopsprite grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-background">
  <Toolbar>
    <IconButton label="New sprite…" size="sm" popovertarget="new-{popover}" style="anchor-name: --new-{popover}"><FilePlusIcon weight="bold" /></IconButton>
    <IconButton label="Open… (Mod+O)" size="sm" onclick={open}><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Open from device…" size="sm" onclick={open_device}><DevicesIcon weight="bold" /></IconButton>
    <IconButton label="Save (Mod+S)" size="sm" onclick={save}><FloppyDiskIcon weight="bold" /></IconButton>
    <IconButton label="Save as… (Mod+Shift+S)" size="sm" class="hidden @md:inline-flex" onclick={save_as}><FloppyDiskBackIcon weight="bold" /></IconButton>
    <Separator vertical />
    <IconButton label="Undo (Mod+Z)" size="sm" disabled={!editor.undoable} onclick={() => editor.undo()}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
    <IconButton label="Redo (Mod+Shift+Z)" size="sm" disabled={!editor.redoable} onclick={() => editor.redo()}><ArrowClockwiseIcon weight="bold" /></IconButton>
    <Separator vertical />
    <IconButton label="Sprite size…" size="sm" popovertarget="size-{popover}" style="anchor-name: --size-{popover}"><ResizeIcon weight="bold" /></IconButton>
    <IconButton label="Flip and rotate the sprite" size="sm" onclick={sprite_menu}><DotsThreeIcon weight="bold" /></IconButton>

    <span class="flex min-w-12 flex-1 items-center gap-1.5 px-1">
      {#if kernel.platform === Platform.MOBILE}
        <span class="truncate text-ui font-medium" title={file_path ?? "Not saved yet"}>{file_name}</span>
        {#if editor.dirty}<span class="size-2 shrink-0 rounded-full bg-primary" role="img" aria-label="Unsaved changes"></span>{/if}
      {/if}
    </span>

    <div class="hidden items-center gap-0.5 @lg:flex" role="group" aria-label="Zoom">{@render zoom_controls()}</div>
    <Separator vertical class="hidden @lg:block" />
    <Button size="sm" popovertarget="export-{popover}" style="anchor-name: --export-{popover}">
      <ExportIcon weight="bold" /><span class="hidden @sm:inline">Export</span>
    </Button>
  </Toolbar>

  <HopspriteOptions {editor} {prefs} />

  <div class="body min-h-0">
    <div class="area-tools min-h-0 overflow-auto border-foreground/8 @2xl:border-r">
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
      <div class="pointer-events-auto absolute right-2 bottom-2 flex items-center gap-0.5 rounded-lg bg-background-light/90 p-0.5 shadow-popover @lg:hidden" role="group" aria-label="Zoom">
        {@render zoom_controls()}
      </div>
    </div>

    <div class="area-tabs flex items-center gap-1 border-t border-foreground/8 bg-background-light px-2 py-1.5 @2xl:hidden">
      <Segmented
        size="sm"
        label="Panel"
        class="flex-1 [&>label]:flex-1 [&>label]:justify-center"
        options={[
          { value: "palette", label: "Palette" },
          { value: "timeline", label: "Layers & frames" },
        ]}
        bind:value={() => panel.value, (value) => ((panel.value = value), (panel_open.value = true))}
      />
      <IconButton label={panel_open.value ? "Hide panel" : "Show panel"} size="sm" onclick={() => (panel_open.value = !panel_open.value)}>
        {#if panel_open.value}<CaretDownIcon weight="bold" />{:else}<CaretUpIcon weight="bold" />{/if}
      </IconButton>
    </div>

    <div class={["area-palette min-h-0 overflow-auto border-foreground/8 bg-background-light @2xl:border-l", (panel.value !== "palette" || !panel_open.value) && "narrow-hidden"]}>
      <HopspritePalette {editor} />
    </div>

    <div class={["area-timeline min-h-0 border-t border-foreground/8", (panel.value !== "timeline" || !panel_open.value) && "narrow-hidden"]}>
      <HopspriteTimeline
        {editor}
        {playing}
        mode={prefs.play_mode}
        {range}
        onion={prefs.onion}
        ontoggleplay={toggle_play}
      />
    </div>
  </div>

  <StatusBar>
    <span>{sprite.width} × {sprite.height}</span>
    <span>{cursor ? `${cursor.x}, ${cursor.y}` : "–"}</span>
    <span class="hidden @sm:inline">Frame {editor.frame + 1}/{sprite.frames.length}</span>
    <span class="hidden @md:flex items-center gap-1.5">
      <span class="inline-block size-2.5 rounded-xs ring-1 ring-foreground/30" style:background={primary_rgba}></span>
      #{editor.primary}{cursor_index !== null ? ` · under cursor #${cursor_index}` : ""}
    </span>
    <span class="hidden @lg:inline">{sprite.palette.length - 1} colours · {sprite.layers.length} layers</span>
    {#if paints(prefs.tool.value) && (prefs.mirror_x.value || prefs.mirror_y.value)}<span class="hidden @md:inline">Mirror on</span>{/if}
  </StatusBar>
</div>

<HopspriteNewPopover id="new-{popover}" anchor="--new-{popover}" oncreate={create} />
<HopspriteSizePopover id="size-{popover}" anchor="--size-{popover}" {editor} />
<HopspriteExportPopover id="export-{popover}" anchor="--export-{popover}" {editor} onexport={export_svg} />

<style>
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(8rem, 1fr) auto auto minmax(0, auto);
    grid-template-areas: "stage" "tools" "tabs" "panel";
  }

  .area-stage {
    grid-area: stage;
  }

  .area-tools {
    grid-area: tools;
    border-top-width: 1px;
  }

  .area-tabs {
    grid-area: tabs;
  }

  .area-palette,
  .area-timeline {
    grid-area: panel;
    max-height: 13rem;
  }

  .area-timeline {
    display: grid;
  }

  .narrow-hidden {
    display: none;
  }

  @container (width >= 42rem) {
    .body {
      grid-template-columns: auto minmax(0, 1fr) 15rem;
      grid-template-rows: minmax(0, 1fr) minmax(0, 13.5rem);
      grid-template-areas:
        "tools stage palette"
        "timeline timeline timeline";
    }

    .area-tools {
      border-top-width: 0;
    }

    .area-palette {
      grid-area: palette;
      max-height: none;
    }

    .area-timeline {
      grid-area: timeline;
      max-height: none;
    }

    .narrow-hidden {
      display: block;
    }

    .area-timeline.narrow-hidden {
      display: grid;
    }
  }
</style>

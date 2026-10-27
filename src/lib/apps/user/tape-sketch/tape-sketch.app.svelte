<script lang="ts">
  import kernel, { Platform, ShortcutCategory, type AppsService, type DialogsService, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import { Button, IconButton, Spinner, Switch, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { base_name, file_stem, parent_path } from "$lib/core/api/services/files/path";
  import { cn } from "$lib/core/utils";
  import { fit_view, type View } from "$kit/utils/view";
  import { report_error } from "$kit/utils/report-error";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowsOutLineHorizontal as ArrowsOutLineHorizontalIcon,
    CaretDown as CaretDownIcon,
    Compass as CompassIcon,
    CornersOut as CornersOutIcon,
    Cursor as CursorIcon,
    Export as ExportIcon,
    FilePlus as FilePlusIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    Footprints as FootprintsIcon,
    MagnetStraight as MagnetStraightIcon,
    MapPin as MapPinIcon,
    PencilSimpleLine as PencilSimpleLineIcon,
    Polygon as PolygonIcon,
    Ruler as RulerIcon,
    TextT as TextTIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { onMount, untrack, type Component } from "svelte";
  import { z } from "zod";
  import {
    add_dim,
    add_marker,
    add_note,
    add_point,
    append_point,
    close_path,
    delete_dim,
    delete_marker,
    delete_note,
    delete_path,
    delete_point,
    finish_path,
    length_of,
    redraw_to_scale,
    reverse_path,
    set_check,
    set_length,
    set_marker_note,
    set_note,
    set_snap,
    set_unit,
    start_path,
    walk,
  } from "./edit";
  import { Editor, Pick, Tool } from "./editor.svelte";
  import { sketch_svg, svg_to_png } from "./export";
  import { EXTENSION, serialize_sketch, sketch_name_for } from "./format";
  import {
    closure,
    DIRECTIONS,
    measures,
    nearest_direction,
    parse_angles,
    path_scale,
    snap_dir,
    snap_directions,
    snap_preset,
    SNAP_PRESETS,
    SnapPreset,
    type Direction,
  } from "./geometry";
  import { read_path, write_file } from "./io";
  import { create_sketch, edge_count, point_map, Unit, UNITS, type Point, type Sketch, type Target } from "./model";
  import { rotate, turn_camera } from "./rotation";
  import { sketch_bounds } from "./scene";
  import TapeSketchCanvas, { type Hit, type TapEvent } from "./tape-sketch-canvas.svelte";
  import TapeSketchMeasure from "./tape-sketch-measure.svelte";
  import TapeSketchWalk from "./tape-sketch-walk.svelte";
  import { format_area, format_length, input_for, parse_input, UNIT_LABELS } from "./units";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const editor = new Editor();
  const snap = storage.persisted("snap", true, z.boolean());

  let view = $state<View>({ scale: 1, offset_x: 0, offset_y: 0 });
  let rotation = $state(0);
  let width = $state(0);
  let height = $state(0);
  let fitted = false;
  let root = $state<HTMLElement>();

  let file_path = $state<string | null>(null);
  let untitled = $state(`Untitled${EXTENSION}`);
  let loading = $state(false);
  let notice = $state<string | null>(null);

  const sketch = $derived(editor.sketch);
  const file_name = $derived(file_path ? base_name(file_path) : untitled);
  const read_only = $derived(file_path !== null && is_system_path(file_path));
  const mobile = kernel.platform === Platform.MOBILE;

  $effect(() => win.set_title(file_name));
  $effect(() => win.set_dirty(editor.dirty, { save }));

  $effect(() => {
    if (!notice) return;
    const timer = setTimeout(() => (notice = null), 2600);
    return () => clearTimeout(timer);
  });

  function fit() {
    if (!width || !height) return;
    const bounds = sketch_bounds(editor.sketch, rotation);
    if (!bounds) {
      view = { scale: 1, offset_x: width / 2, offset_y: height / 2 };
      return;
    }
    const fitted_view = fit_view(Math.max(bounds.w, 40), Math.max(bounds.h, 40), width, height, 64);
    const scale = Math.min(fitted_view.scale, 3);
    view = {
      scale,
      offset_x: width / 2 - (bounds.x + bounds.w / 2) * scale,
      offset_y: height / 2 - (bounds.y + bounds.h / 2) * scale,
    };
  }

  function unrotate() {
    const camera = turn_camera({ view, rotation }, 0, { x: width / 2, y: height / 2 });
    view = camera.view;
    rotation = camera.rotation;
  }

  $effect(() => {
    if (fitted || !width || !height) return;
    fitted = true;
    untrack(fit);
  });

  let last_size = { width: 0, height: 0, panel: false };

  // A resized window keeps the middle of the sketch in the middle; a sheet rising from below leaves the top where it was.
  $effect(() => {
    const size = { width, height, panel: panel_open };
    untrack(() => {
      if (last_size.width && last_size.height && size.width && size.height) {
        const dx = (size.width - last_size.width) / 2;
        const dy = size.panel === last_size.panel ? (size.height - last_size.height) / 2 : 0;
        view = { ...view, offset_x: view.offset_x + dx, offset_y: view.offset_y + dy };
      }
      last_size = size;
    });
  });

  function zoom(factor: number) {
    const scale = Math.max(0.05, Math.min(64, view.scale * factor));
    const k = scale / view.scale;
    view = { scale, offset_x: width / 2 - (width / 2 - view.offset_x) * k, offset_y: height / 2 - (height / 2 - view.offset_y) * k };
  }


  async function discard_ok(): Promise<boolean> {
    editor.commit_input();
    return !editor.dirty || confirm_discard(win, file_name);
  }

  let open_request = 0;

  async function load(path: string) {
    const id = ++open_request;
    loading = true;
    try {
      const opened = await read_path(path);
      if (id !== open_request) return;
      editor.load(opened.sketch);
      if (opened.dropped_boxes) {
        const count = opened.dropped_boxes;
        notifications.notify(app_id, {
          title: `${count} ${count === 1 ? "box" : "boxes"} left out`,
          message: "Boxes are gone from Tape Sketch. Draw the outline and type its lengths instead.",
        });
      }
      if (opened.moved_heights) {
        const count = opened.moved_heights;
        notifications.notify(app_id, {
          title: `${count} ${count === 1 ? "height" : "heights"} moved to markers`,
          message: "Tape Sketch no longer has heights or a 3D view. Each height is now a note on its shape's first corner.",
        });
      }
      file_path = path;
      untitled = base_name(path);
      fit();
    } catch (reason) {
      if (id === open_request) report_error(app_id, `Couldn't open ${base_name(path)}`, reason);
    } finally {
      if (id === open_request) loading = false;
    }
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({ accept: [EXTENSION], start_path: file_path ? parent_path(file_path) : undefined, title: "Open in Tape Sketch" });
    if (chosen) await load(chosen);
  }

  async function create() {
    if (!(await discard_ok())) return;
    editor.load(create_sketch(editor.committed.unit, editor.committed.snap));
    file_path = null;
    untitled = `Untitled${EXTENSION}`;
    fit();
  }

  async function write(path: string): Promise<boolean> {
    editor.commit_input();
    const snapshot = editor.committed;
    try {
      await write_file(path, serialize_sketch(snapshot));
      file_path = path;
      editor.mark_saved(snapshot);
      notifications.notify(app_id, { title: "Sketch saved", message: path });
      return true;
    } catch (reason) {
      report_error(app_id, "Couldn't save the sketch", reason);
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const path = await win.pick_save({
      name: sketch_name_for(file_name, file_stem(file_name)),
      accept: [EXTENSION],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
      title: "Save sketch",
    });
    if (!path) return false;
    return write(path.toLowerCase().endsWith(EXTENSION) ? path : `${path}${EXTENSION}`);
  }

  function save(): Promise<boolean> {
    return file_path && !read_only ? write(file_path) : save_as();
  }

  async function export_as(format: "png" | "svg") {
    editor.commit_input();
    const svg = sketch_svg(editor.committed);
    if (!svg) {
      notice = "Nothing to export yet";
      return;
    }
    const path = await win.pick_save({
      name: `${file_stem(file_name) || "sketch"}.${format}`,
      accept: format === "png" ? [".png", "image/png"] : [".svg", "image/svg+xml"],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
      title: `Export as ${format.toUpperCase()}`,
    });
    if (!path) return;
    const target = path.toLowerCase().endsWith(`.${format}`) ? path : `${path}.${format}`;
    try {
      await write_file(target, format === "png" ? await svg_to_png(svg) : new Blob([svg], { type: "image/svg+xml" }));
      notifications.notify(app_id, { title: "Sketch exported", message: target, actions: [{ label: "Open", on_click: () => void apps.open(target) }] });
    } catch (reason) {
      report_error(app_id, "Couldn't export the sketch", reason);
    }
  }

  function below(event: MouseEvent): Point {
    const target = event.currentTarget;
    if (!(target instanceof Element)) return { x: event.clientX, y: event.clientY };
    const box = target.getBoundingClientRect();
    return { x: box.left, y: box.bottom + 4 };
  }

  async function file_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      [
        { id: "new", label: "New sketch", icon: FilePlusIcon },
        { id: "open", label: "Open…", icon: FolderOpenIcon, shortcut: "Mod+O" },
        { id: "save", label: "Save", icon: FloppyDiskIcon, shortcut: "Mod+S" },
        { id: "save-as", label: "Save as…", icon: FloppyDiskBackIcon, shortcut: "Mod+Shift+S" },
        { separator: true },
        { id: "png", label: "Export PNG…", icon: ExportIcon },
        { id: "svg", label: "Export SVG…", icon: ExportIcon },
      ],
      { anchor: below(event) }
    );
    if (choice === "new") void create();
    else if (choice === "open") void open();
    else if (choice === "save") void save();
    else if (choice === "save-as") void save_as();
    else if (choice === "png" || choice === "svg") void export_as(choice);
  }

  async function unit_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      UNITS.map((unit) => ({ id: unit, label: `${UNIT_LABELS[unit]} (${unit})${unit === sketch.unit ? " ✓" : ""}` })),
      { anchor: below(event) }
    );
    if (!choice || choice === sketch.unit) return;
    editor.commit_input();
    editor.apply((value) => set_unit(value, choice as Unit));
    if (editor.target) editor.input = input_for(length_of(editor.sketch, editor.target), editor.sketch.unit);
  }

  const MAGNET_DETAILS: Record<string, string> = {
    [SnapPreset.DEG_45]: "8 directions",
    [SnapPreset.ISO]: "30°, 90°, 150°",
    [SnapPreset.DEG_15]: "24 directions",
  };
  const magnet = $derived(snap_preset(sketch.snap));
  const magnet_label = $derived(SNAP_PRESETS.find((preset) => preset.id === magnet)?.label ?? "Custom");

  async function magnet_menu(event: MouseEvent) {
    const mark = (on: boolean) => (on ? " ✓" : "");
    const choice = await dialogs.menu(
      [
        { id: "off", label: `Off${mark(!snap.value)}` },
        { separator: true },
        ...SNAP_PRESETS.map((preset) => ({
          id: preset.id,
          label: `${preset.label} · ${MAGNET_DETAILS[preset.id]}${mark(snap.value && magnet === preset.id)}`,
        })),
        {
          id: SnapPreset.CUSTOM,
          label: magnet === SnapPreset.CUSTOM ? `Custom · ${sketch.snap.join("°, ")}°${mark(snap.value)}` : "Custom…",
        },
      ],
      { anchor: below(event) }
    );
    if (!choice) return;
    if (choice === "off") {
      snap.value = false;
      return;
    }
    let angles = SNAP_PRESETS.find((preset) => preset.id === choice)?.angles ?? null;
    if (choice === SnapPreset.CUSTOM) {
      const text = await win.prompt("Magnet angles in degrees, each also works the other way round", {
        initial: sketch.snap.join(", "),
        placeholder: "0, 22.5, 63, 90",
        confirm_label: "Use",
      });
      if (text === null) return;
      angles = parse_angles(text);
      if (!angles) {
        notice = "Type angles in degrees, like 0, 22.5, 90";
        return;
      }
    }
    snap.value = true;
    const next = angles!;
    editor.apply((value) => set_snap(value, next));
  }

  function set_path_check(path: string, check: boolean) {
    editor.commit_input();
    editor.apply((value) => set_check(value, path, check));
  }


  interface ToolInfo {
    id: Tool;
    label: string;
    icon: Component<{ class?: string; weight?: "bold" | "fill" | "regular" }>;
    key: string;
  }

  const TOOLS: ToolInfo[] = [
    { id: Tool.SELECT, label: "Select", icon: CursorIcon, key: "v" },
    { id: Tool.CORNERS, label: "Corners", icon: PolygonIcon, key: "c" },
    { id: Tool.WALK, label: "Walk", icon: FootprintsIcon, key: "w" },
    { id: Tool.DIM, label: "Measure", icon: ArrowsOutLineHorizontalIcon, key: "d" },
    { id: Tool.MARKER, label: "Marker", icon: MapPinIcon, key: "m" },
    { id: Tool.NOTE, label: "Note", icon: TextTIcon, key: "n" },
  ];

  function is_orphan(value: Sketch, id: string): boolean {
    return (
      !value.paths.some((path) => path.points.includes(id)) &&
      !value.dims.some((dim) => dim.a === id || dim.b === id) &&
      !value.markers.some((marker) => marker.point === id)
    );
  }

  function finish_drawing() {
    const drawing = editor.drawing;
    if (!drawing) return;
    editor.drawing = null;
    editor.apply((value) => finish_path(value, drawing));
    if (editor.committed.paths.some((path) => path.id === drawing)) editor.selection = { kind: Pick.PATH, id: drawing };
  }

  function leave_walk() {
    const from = editor.walk_from;
    editor.walk_from = null;
    editor.input = "";
    editor.typed = false;
    if (from && is_orphan(editor.committed, from)) editor.apply((value) => delete_point(value, from));
  }

  function set_tool(tool: Tool) {
    if (tool === editor.tool) return;
    editor.close_numpad();
    finish_drawing();
    if (editor.tool === Tool.WALK) leave_walk();
    editor.dim_from = null;
    editor.tool = tool;
    if (tool === Tool.WALK && editor.selection?.kind === Pick.POINT) editor.walk_from = editor.selection.id;
    if (tool !== Tool.SELECT) editor.selection = null;
  }

  function point_of(hit: Hit | null): string | null {
    if (hit?.kind === "point") return hit.id;
    if (hit?.kind === "marker") return editor.committed.markers.find((marker) => marker.id === hit.id)?.point ?? null;
    return null;
  }

  function open_first(path: string) {
    const value = editor.committed;
    const item = value.paths.find((each) => each.id === path);
    if (!item) return;
    const index = item.lengths.findIndex((each) => each === null);
    if (index >= 0) editor.open_numpad({ kind: "edge", path, index });
  }

  function measure(target: Target) {
    editor.selection = target.kind === "dim" ? { kind: Pick.DIM, id: target.id } : { kind: Pick.PATH, id: target.path };
    editor.open_numpad(target);
  }

  function tap_select(hit: Hit | null) {
    if (!hit) {
      editor.close_numpad();
      editor.selection = null;
      return;
    }
    if (hit.kind === "target") {
      measure(hit.target);
      return;
    }
    if (hit.kind === "edge") {
      editor.selection = { kind: Pick.PATH, id: hit.path };
      editor.open_numpad({ kind: "edge", path: hit.path, index: hit.index });
      return;
    }
    if (hit.kind === "dim") {
      editor.selection = { kind: Pick.DIM, id: hit.id };
      editor.open_numpad({ kind: "dim", id: hit.id });
      return;
    }
    editor.close_numpad();
    if (hit.kind === "point") editor.selection = { kind: Pick.POINT, id: hit.id };
    else if (hit.kind === "note") editor.selection = { kind: Pick.NOTE, id: hit.id };
    else if (hit.kind === "marker") editor.selection = { kind: Pick.MARKER, id: hit.id };
  }

  function tap_corner(hit: Hit | null, at: Point) {
    const value = editor.committed;
    const drawing = value.paths.find((path) => path.id === editor.drawing);
    const existing = point_of(hit);
    if (existing) {
      if (drawing) {
        if (existing === drawing.points[0] && drawing.points.length >= 3) {
          editor.apply((s) => close_path(s, drawing.id));
          editor.drawing = null;
          editor.tool = Tool.SELECT;
          editor.selection = { kind: Pick.PATH, id: drawing.id };
          open_first(drawing.id);
          return;
        }
        if (drawing.points.includes(existing)) return;
        editor.apply((s) => append_point(s, drawing.id, existing));
        return;
      }
      const ends = value.paths.find((path) => !path.closed && path.points.at(-1) === existing);
      const starts = value.paths.find((path) => !path.closed && path.points.length > 1 && path.points[0] === existing);
      if (ends) editor.drawing = ends.id;
      else if (starts) {
        editor.apply((s) => reverse_path(s, starts.id));
        editor.drawing = starts.id;
      } else {
        let id = "";
        editor.apply((s) => {
          const started = start_path(s, existing);
          id = started.id;
          return started.sketch;
        });
        editor.drawing = id;
      }
      return;
    }
    let p = at;
    if (drawing && snap.value) {
      const last = value.points.find((point) => point.id === drawing.points.at(-1));
      if (last) p = snap_dir(last, at, snap_directions(value.snap));
    }
    let path_id = drawing?.id ?? "";
    editor.apply((s) => {
      const added = add_point(s, p);
      if (drawing) return append_point(added.sketch, drawing.id, added.id);
      const started = start_path(added.sketch, added.id);
      path_id = started.id;
      return started.sketch;
    });
    editor.drawing = path_id;
  }

  function tap_walk(hit: Hit | null, at: Point) {
    const existing = point_of(hit);
    const previous = editor.walk_from;
    if (existing) {
      if (previous && previous !== existing && is_orphan(editor.committed, previous)) editor.apply((s) => delete_point(s, previous));
      editor.walk_from = existing;
      return;
    }
    let id = "";
    editor.apply((s) => {
      const base = previous && is_orphan(s, previous) ? delete_point(s, previous) : s;
      const added = add_point(base, at);
      id = added.id;
      return added.sketch;
    });
    editor.walk_from = id;
  }

  function walk_step(direction: Direction) {
    const from = editor.walk_from;
    const value = parse_input(editor.input, sketch.unit);
    if (!from) return;
    if (value === null) {
      notice = "Type a length first";
      return;
    }
    let result: ReturnType<typeof walk> | null = null;
    editor.apply((s) => {
      result = walk(s, from, direction, value);
      return result.sketch;
    });
    const done = result as ReturnType<typeof walk> | null;
    editor.input = "";
    editor.typed = false;
    if (!done) return;
    if (done.closed) {
      editor.walk_from = null;
      editor.tool = Tool.SELECT;
      editor.selection = { kind: Pick.PATH, id: done.path };
      notice = "Shape closed";
    } else editor.walk_from = done.point;
  }

  const walk_path = $derived(sketch.paths.find((path) => !path.closed && path.points.at(-1) === editor.walk_from) ?? null);

  function walk_close() {
    const path = walk_path;
    if (!path || path.points.length < 3) return;
    editor.apply((s) => close_path(s, path.id));
    editor.walk_from = null;
    editor.input = "";
    editor.tool = Tool.SELECT;
    editor.selection = { kind: Pick.PATH, id: path.id };
    open_first(path.id);
  }

  function tap_dim(hit: Hit | null, at: Point) {
    const existing = point_of(hit);
    const from = editor.dim_from;
    let id = existing ?? "";
    if (!from) {
      if (!existing) {
        editor.apply((s) => {
          const added = add_point(s, at);
          id = added.id;
          return added.sketch;
        });
      }
      editor.dim_from = id;
      return;
    }
    if (existing === from) return;
    let dim_id = "";
    editor.apply((s) => {
      let base = s;
      if (!existing) {
        const added = add_point(base, at);
        base = added.sketch;
        id = added.id;
      }
      const added = add_dim(base, from, id, Math.round(28 / view.scale));
      dim_id = added.id;
      return added.sketch;
    });
    editor.dim_from = null;
    editor.tool = Tool.SELECT;
    editor.selection = { kind: Pick.DIM, id: dim_id };
    editor.open_numpad({ kind: "dim", id: dim_id });
  }

  async function tap_marker(hit: Hit | null, at: Point) {
    const existing = point_of(hit);
    const note = await win.prompt("What's here?", { placeholder: "Lamp, socket, hook…", confirm_label: "Add marker" });
    if (note === null) return;
    let id = "";
    editor.apply((s) => {
      let base = s;
      let point = existing;
      if (!point) {
        const added = add_point(base, at);
        base = added.sketch;
        point = added.id;
      }
      const marker = add_marker(base, point, note.trim());
      id = marker.id;
      return marker.sketch;
    });
    editor.tool = Tool.SELECT;
    editor.selection = { kind: Pick.MARKER, id };
  }

  async function edit_note(id: string) {
    const note = editor.committed.notes.find((each) => each.id === id);
    if (!note) return;
    const text = await win.prompt("Note", { initial: note.text, confirm_label: "Save" });
    if (text === null) return;
    editor.apply((s) => (text.trim() ? set_note(s, id, { text: text.trim() }) : delete_note(s, id)));
  }

  async function tap_note(hit: Hit | null, at: Point) {
    if (hit?.kind === "note") {
      editor.selection = { kind: Pick.NOTE, id: hit.id };
      await edit_note(hit.id);
      return;
    }
    const text = await win.prompt("Note", { placeholder: "Kitchen, paint white…", confirm_label: "Add note" });
    if (!text?.trim()) return;
    let id = "";
    editor.apply((s) => {
      const added = add_note(s, at, text.trim());
      id = added.id;
      return added.sketch;
    });
    editor.tool = Tool.SELECT;
    editor.selection = { kind: Pick.NOTE, id };
  }

  function on_tap({ hit, at }: TapEvent) {
    root?.querySelector<SVGElement>("svg")?.focus({ preventScroll: true });
    const tool = editor.tool;
    if (tool === Tool.SELECT) tap_select(hit);
    else if (tool === Tool.CORNERS) tap_corner(hit, at);
    else if (tool === Tool.WALK) tap_walk(hit, at);
    else if (tool === Tool.DIM) tap_dim(hit, at);
    else if (tool === Tool.MARKER) void tap_marker(hit, at);
    else if (tool === Tool.NOTE) void tap_note(hit, at);
  }


  function delete_selection() {
    const selected = editor.selection;
    if (!selected) return;
    editor.close_numpad(false);
    const { kind, id } = selected;
    editor.apply((s) => {
      if (kind === Pick.POINT) return delete_point(s, id);
      if (kind === Pick.PATH) return delete_path(s, id);
      if (kind === Pick.DIM) return delete_dim(s, id);
      if (kind === Pick.MARKER) return delete_marker(s, id);
      return delete_note(s, id);
    });
    editor.selection = null;
  }

  async function edit_marker(id: string) {
    const marker = editor.committed.markers.find((each) => each.id === id);
    if (!marker) return;
    const note = await win.prompt("What's here?", { initial: marker.note, confirm_label: "Save" });
    if (note !== null) editor.apply((s) => set_marker_note(s, id, note.trim()));
  }

  function add_marker_here(point: string) {
    void tap_marker({ kind: "point", id: point }, { x: 0, y: 0 });
  }

  const focus_path = $derived.by(() => {
    if (editor.selection?.kind === Pick.PATH) return sketch.paths.find((path) => path.id === editor.selection!.id) ?? null;
    if (editor.target?.kind === "edge") {
      const target = editor.target;
      return sketch.paths.find((path) => path.id === target.path) ?? null;
    }
    return null;
  });

  const summary = $derived.by(() => {
    const path = focus_path;
    if (!path) return null;
    const points = point_map(sketch);
    const check = closure(path, points);
    const result = measures(path, points);
    const open = path.lengths.filter((each) => each === null).length;
    const gap = check && !check.closes ? check.gap : null;
    return {
      path,
      name: `Shape ${sketch.paths.indexOf(path) + 1}`,
      edges: edge_count(path),
      open,
      check,
      result,
      gap,
      can_redraw: path_scale(path, points) !== null && path.check,
    };
  });

  function gap_text(gap: { x: number | null; y: number | null }, tolerance: number): string {
    const parts: string[] = [];
    if (gap.x !== null && Math.abs(gap.x) > tolerance) parts.push(`↔ ${format_length(Math.abs(gap.x), sketch.unit)}`);
    if (gap.y !== null && Math.abs(gap.y) > tolerance) parts.push(`↕ ${format_length(Math.abs(gap.y), sketch.unit)}`);
    return parts.join(" ");
  }

  function use_implied(path: string, index: number, value: number) {
    editor.commit_input();
    editor.apply((s) => set_length(s, { kind: "edge", path, index }, value));
    if (editor.target?.kind === "edge" && editor.target.path === path && editor.target.index === index) {
      editor.input = input_for(value, sketch.unit);
      editor.typed = false;
    }
  }

  function redraw(path: string) {
    editor.commit_input();
    editor.apply((s) => redraw_to_scale(s, path));
    notice = "Redrawn to scale. Undo puts it back";
  }

  const selected_point = $derived(editor.selection?.kind === Pick.POINT ? editor.selection.id : null);

  const hint = $derived.by(() => {
    const tool = editor.tool;
    if (tool === Tool.CORNERS) {
      const drawing = sketch.paths.find((path) => path.id === editor.drawing);
      if (!drawing) return "Tap the first corner";
      return drawing.points.length >= 3 ? "Tap the first corner to close" : "Tap the next corner";
    }
    if (tool === Tool.DIM) return editor.dim_from ? "Tap the second point" : "Tap two points to measure between";
    if (tool === Tool.MARKER) return "Tap a corner or a spot to mark";
    if (tool === Tool.NOTE) return "Tap where the note goes";
    if (!editor.selection) return sketch.points.length ? "Tap a number to measure it" : "Pick Corners or Walk to start";
    return "";
  });


  function digit(event: KeyboardEvent): string | null {
    const match = /^(?:Digit|Numpad)(\d)$/.exec(event.code);
    if (match) return match[1];
    if (/^\d$/.test(event.key)) return event.key;
    if (event.code === "NumpadDecimal" || event.key === "." || event.key === ",") return ".";
    if (event.key === "Backspace") return "back";
    return null;
  }

  const WALK_KEYS: Record<string, string> = {
    ArrowUp: "n",
    ArrowDown: "s",
    ArrowLeft: "w",
    ArrowRight: "e",
    Home: "nw",
    PageUp: "ne",
    End: "sw",
    PageDown: "se",
  };

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!(event.target instanceof Element) || event.target.closest("input, textarea, [contenteditable]")) return;
    const typed = digit(event);
    if (editor.target) {
      if (typed) editor.press(typed);
      else if (event.key === "Enter") editor.close_numpad();
      else if (event.key === "Escape") editor.close_numpad(false);
      else if (event.key === "Delete") editor.clear_input();
      else if (event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey)) editor.step(1);
      else if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) editor.step(-1);
      else return;
      event.preventDefault();
      return;
    }
    if (editor.tool === Tool.WALK) {
      const screen = DIRECTIONS.find((each) => each.id === WALK_KEYS[event.key]);
      const direction = screen ? nearest_direction(snap_directions(sketch.snap), rotate(screen, -rotation)) : null;
      if (typed) editor.press(typed);
      else if (direction) walk_step(direction);
      else if (event.key === "Escape") set_tool(Tool.SELECT);
      else return;
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && editor.drawing) finish_drawing();
    else if (event.key === "Escape") {
      if (editor.drawing) finish_drawing();
      else if (editor.dim_from) editor.dim_from = null;
      else editor.selection = null;
    } else if ((event.key === "Delete" || event.key === "Backspace") && editor.selection) delete_selection();
    else return;
    event.preventDefault();
  }

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `tape-sketch.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", () => editor.undo()),
      scoped("redo", "mod+shift+z", "Redo", () => editor.redo()),
      scoped("redo-alt", "mod+y", "Redo", () => editor.redo()),
      scoped("open", "mod+o", "Open…", open),
      scoped("save", "mod+s", "Save", save),
      scoped("save-as", "mod+shift+s", "Save as…", save_as),
      scoped("fit", "mod+0", "Fit the sketch", fit),
      ...TOOLS.map((tool) =>
        scoped(`tool.${tool.id}`, tool.key, tool.label, () => {
          if (!editor.target && editor.tool !== Tool.WALK) set_tool(tool.id);
        })
      ),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  $effect(() =>
    win.on_back(() => {
      if (editor.target) editor.close_numpad();
      else if (editor.tool === Tool.WALK) set_tool(Tool.SELECT);
      else if (editor.drawing) finish_drawing();
      else if (editor.selection) editor.selection = null;
      else return false;
      return true;
    })
  );

  onMount(() => {
    const path = untrack(() => initial_path);
    if (path) void load(path);
  });

  const panel_open = $derived(!!editor.target || editor.tool === Tool.WALK);

</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class={cn("tape bg-background", panel_open && "panel-open")} onkeydown={on_keydown}>
  <Toolbar class="area-bar flex-nowrap gap-1">
    <Button
      size="sm"
      variant="quiet"
      class="max-w-40 min-w-0 shrink gap-1 pr-1.5"
      aria-label="File: {file_name}{editor.dirty ? ', unsaved changes' : ''}"
      title={file_path ?? "Not saved yet"}
      onclick={file_menu}
    >
      <span class="min-w-0 truncate font-medium">{mobile ? file_stem(file_name) : "File"}</span>
      {#if editor.dirty && mobile}<span class="size-2 shrink-0 rounded-full bg-primary"></span>{/if}
      <CaretDownIcon weight="bold" class="size-3 shrink-0 opacity-65" />
    </Button>
    <IconButton label="Undo (Mod+Z)" size="sm" class="shrink-0" disabled={!editor.undoable} onclick={() => editor.undo()}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
    <IconButton label="Redo (Mod+Shift+Z)" size="sm" class="shrink-0" disabled={!editor.redoable} onclick={() => editor.redo()}><ArrowClockwiseIcon weight="bold" /></IconButton>
    <span class="flex-1"></span>
    {#if editor.tool === Tool.CORNERS || editor.tool === Tool.WALK}
      {@const on = snap.value || editor.tool === Tool.WALK}
      <Button
        size="sm"
        variant="quiet"
        class={cn("shrink-0 gap-1 pr-1.5", on && "text-primary")}
        aria-label="Magnet: {on ? magnet_label : 'off'}"
        title="Magnet angles"
        onclick={magnet_menu}
      >
        <MagnetStraightIcon weight={on ? "fill" : "bold"} />{on ? magnet_label : "Off"}<CaretDownIcon weight="bold" class="size-3 opacity-65" />
      </Button>
    {/if}
    <Button size="sm" variant="quiet" class="shrink-0 gap-1 pr-1.5 font-mono" aria-label="Units: {UNIT_LABELS[sketch.unit]}" onclick={unit_menu}>
      <RulerIcon weight="bold" />{sketch.unit}<CaretDownIcon weight="bold" class="size-3 opacity-65" />
    </Button>
    <IconButton label="Fit the sketch (Mod+0)" size="sm" class="shrink-0" onclick={fit}><CornersOutIcon weight="bold" /></IconButton>
  </Toolbar>

  <div class="area-stage relative grid min-h-0 min-w-0">
    <TapeSketchCanvas {editor} bind:view bind:rotation bind:width bind:height ontap={on_tap} />

    {#if rotation}
      <IconButton label="Turn back to upright ({Math.round((rotation * 180) / Math.PI)}°)" size="md" class="absolute top-2 right-2 bg-background-light/95 shadow-popover" onclick={unrotate}>
        <CompassIcon weight="bold" style="rotate: {rotation}rad" />
      </IconButton>
    {/if}

    {#if summary}
      <div class="pointer-events-none absolute inset-x-2 bottom-2 flex justify-start">
        <div class="pointer-events-auto flex max-w-full flex-col gap-1 rounded-lg bg-background-light/95 px-3 py-2 text-ui shadow-popover" aria-live="polite">
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="font-medium">{summary.name}</span>
            <span class="text-2xs text-foreground/65">
              {summary.path.closed ? "closed" : "open"} · {summary.edges} edges{summary.open ? ` · ${summary.open} to measure` : ""}
            </span>
          </div>
          {#if summary.result}
            <div class="font-mono text-2xs tabular-nums text-foreground/80">
              Perimeter {format_length(summary.result.perimeter, sketch.unit)}{#if summary.result.area !== null}
                · Area {summary.result.approximate ? "≈ " : ""}{format_area(summary.result.area, sketch.unit)}{/if}
            </div>
          {/if}
          {#if summary.gap}
            <div class="text-2xs text-warning">
              The lengths don't close: off by <span class="font-mono">{gap_text(summary.gap, summary.check!.tolerance)}</span>. Remeasure?
            </div>
          {:else if summary.check?.complete}
            <div class="text-2xs text-success">The lengths close</div>
          {/if}
          {#if summary.path.closed && !editor.target}
            <label class="flex w-fit cursor-pointer items-center gap-2 text-2xs text-foreground/80 pointer-coarse:min-h-11">
              <Switch checked={summary.path.check} onchange={(event) => set_path_check(summary.path.id, event.currentTarget.checked)} />
              Check lengths{summary.path.check ? "" : ": off, for a shape that isn't flat"}
            </label>
          {/if}
          {#if summary.check?.implied.length || summary.can_redraw || (summary.open && !editor.target)}
            <div class="flex flex-wrap gap-1 pt-0.5">
              {#each summary.check?.implied ?? [] as item (item.index)}
                <Button size="sm" variant="secondary" onclick={() => use_implied(summary.path.id, item.index, item.value)}>
                  Edge {item.index + 1} = {format_length(item.value, sketch.unit)}
                </Button>
              {/each}
              {#if summary.open && !editor.target}
                <Button size="sm" variant="secondary" onclick={() => open_first(summary.path.id)}>Measure</Button>
              {/if}
              {#if summary.can_redraw}
                <Button size="sm" variant="quiet" onclick={() => redraw(summary.path.id)}>
                  <PencilSimpleLineIcon weight="bold" />Redraw to scale
                </Button>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if !sketch.points.length && !sketch.notes.length && !loading}
      <div class="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
        <div class="max-w-64 text-ui text-foreground/65">
          {editor.tool === Tool.WALK ? "Tap where to start, type a length and pick a direction." : "Tap the corners of a room, a drawer or a fence. Numbers come after."}
        </div>
      </div>
    {/if}

    {#if loading}
      <div class="absolute inset-0 grid place-items-center bg-background-darker/70"><Spinner label="Opening sketch" /></div>
    {/if}
    {#if notice}
      <div class="pointer-events-none absolute inset-x-0 top-3 flex justify-center" aria-live="polite">
        <span class="rounded-full bg-background-lighter px-3 py-1 text-ui shadow-popover">{notice}</span>
      </div>
    {/if}
  </div>

  <div class="area-panel min-w-0">
    {#if editor.target}
      <TapeSketchMeasure {editor} target={editor.target} />
    {:else if editor.tool === Tool.WALK}
      <TapeSketchWalk
        {editor}
        can_close={!!walk_path && walk_path.points.length >= 3}
        {rotation}
        onstep={walk_step}
        onclose={walk_close}
        ondone={() => set_tool(Tool.SELECT)}
      />
    {/if}
  </div>

  <div class="area-dock flex flex-col border-t border-foreground/8 bg-background-light">
    {#if hint || editor.selection || editor.drawing}
      <div class="flex min-h-11 items-center gap-1 overflow-x-auto px-2 py-1 [&>*]:shrink-0">
        {#if hint}<span class="min-w-0 shrink! truncate px-1 text-2xs text-foreground/65">{hint}</span>{/if}
        <span class="flex-1"></span>
        {#if editor.drawing}
          {@const drawing = sketch.paths.find((path) => path.id === editor.drawing)}
          {#if drawing && drawing.points.length >= 3}
            <Button size="sm" variant="secondary" onclick={() => tap_corner({ kind: "point", id: drawing.points[0] }, { x: 0, y: 0 })}>Close shape</Button>
          {/if}
          <Button size="sm" variant="primary" onclick={finish_drawing}>Finish</Button>
        {:else if editor.selection && editor.tool === Tool.SELECT}
          {@const selected = editor.selection}
          {#if selected.kind === Pick.POINT && selected_point}
            <Button size="sm" variant="secondary" onclick={() => set_tool(Tool.WALK)}><FootprintsIcon weight="bold" />Walk from here</Button>
            <Button size="sm" variant="secondary" onclick={() => add_marker_here(selected.id)}><MapPinIcon weight="bold" />Marker</Button>
          {:else if selected.kind === Pick.MARKER}
            <Button size="sm" variant="secondary" onclick={() => edit_marker(selected.id)}>Edit note</Button>
          {:else if selected.kind === Pick.NOTE}
            <Button size="sm" variant="secondary" onclick={() => edit_note(selected.id)}>Edit</Button>
          {/if}
          <IconButton label="Delete" size="md" onclick={delete_selection}><TrashIcon weight="bold" /></IconButton>
        {/if}
      </div>
    {/if}
    <div class="grid grid-cols-6 gap-0.5 px-1 pt-1 pb-1.5" role="toolbar" aria-label="Tools">
      {#each TOOLS as tool (tool.id)}
        {@const Icon = tool.icon}
        {@const active = editor.tool === tool.id}
        <button
          type="button"
          class={cn(
            "flex h-13 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg text-2xs transition-colors",
            active ? "bg-primary/15 text-primary" : "text-foreground/80 hover:bg-foreground/8"
          )}
          aria-pressed={active}
          title="{tool.label} ({tool.key.toUpperCase()})"
          onclick={() => set_tool(tool.id)}
        >
          <Icon class="size-5" weight={active ? "fill" : "regular"} />
          <span class="max-w-full truncate">{tool.label}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .tape {
    container-type: size;
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    grid-template-areas: "bar" "stage" "panel" "dock";
  }

  .tape :global(.area-bar) {
    grid-area: bar;
  }

  .area-stage {
    grid-area: stage;
  }

  .area-panel {
    grid-area: panel;
  }

  .area-dock {
    grid-area: dock;
  }

  .panel-open .area-dock {
    display: none;
  }

  @container (width >= 46rem) {
    .tape.panel-open {
      grid-template-columns: minmax(0, 1fr) 21rem;
      grid-template-rows: auto minmax(0, 1fr) auto;
      grid-template-areas: "bar bar" "stage panel" "dock panel";
    }

    .panel-open .area-dock {
      display: flex;
    }

    .area-panel {
      align-self: end;
    }

    .area-panel :global(.sheet) {
      border-top: none;
      border-left: 1px solid color-mix(in oklch, var(--foreground) 8%, transparent);
    }
  }
</style>

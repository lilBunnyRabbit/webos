<script lang="ts">
  import kernel, {
    Platform,
    ShortcutCategory,
    type AppsService,
    type ClipboardService,
    type DialogsService,
    type NotificationsService,
    type ShortcutsService,
  } from "$lib/core/api";
  import { Button, IconButton, Spinner, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { base_name, file_stem, parent_path } from "$lib/core/api/services/files/path";
  import { cn } from "$lib/core/utils";
  import { report_error } from "$kit/utils/report-error";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowsOutCardinal as ArrowsOutCardinalIcon,
    CaretDown as CaretDownIcon,
    Clipboard as ClipboardIcon,
    ClipboardText as ClipboardTextIcon,
    Copy as CopyIcon,
    CopySimple as CopySimpleIcon,
    CornersOut as CornersOutIcon,
    Cube as CubeIcon,
    Cursor as CursorIcon,
    Export as ExportIcon,
    FilePlus as FilePlusIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    GitMerge as GitMergeIcon,
    LineSegment as LineSegmentIcon,
    PaintBucket as PaintBucketIcon,
    Palette as PaletteIcon,
    PencilSimpleLine as PencilSimpleLineIcon,
    Ruler as RulerIcon,
    Stack as StackIcon,
    Tag as TagIcon,
    Trash as TrashIcon,
    Crosshair as CrosshairIcon,
    Eye as EyeIcon,
  } from "phosphor-svelte";
  import { onMount, untrack, type Component } from "svelte";
  import { z } from "zod";
  import { ink_css, ink_label, SWATCH } from "./colors";
  import {
    add_box,
    add_line,
    add_offset_point,
    center3,
    copy_along,
    delete_items,
    extrude,
    line_points,
    merge_coincident,
    move_points,
    point_at,
    position,
    set_color,
    set_unit,
    translate,
    walk,
    walk_end,
  } from "./edit";
  import { Editor, Op, PlaceKind, Tool, type Selection } from "./editor.svelte";
  import { face_lines, fill } from "./faces";
  import { anchor_of, clip_text, extract_part, parse_clip, place_part } from "./part";
  import { svg_to_png, theme_palette } from "./export";
  import { EXTENSION, serialize_wire, wire_name_for } from "./format";
  import { read_path, write_file } from "./io";
  import { AXES, create_wire, is_hex, LINE_COLORS, ORIGIN, sub3, UNITS, type Axis, type Ink, type Unit, type Vec3, type Wire } from "./model";
  import {
    axis_directions,
    basis,
    drag_length,
    lerp_orbit,
    nearest_axis,
    overlapping,
    preset_of,
    PRESET_LABELS,
    projector,
    PRESETS,
    repivot,
    round_drag,
    ViewPreset,
    type AxisDirection,
    type Camera,
    type Orbit,
  } from "./projection";
  import { fitted_view } from "./scene";
  import { wire_svg } from "./svg";
  import { format_length, input_for, parse_input, parse_numbers, UNIT_LABELS } from "./units";
  import WireframeCanvas, { type Hit, type PlaceGhost, type StrokeEvent } from "./wireframe-canvas.svelte";
  import WireframeGizmo from "./wireframe-gizmo.svelte";
  import WireframePanel from "./wireframe-panel.svelte";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();
  const settings = storage.file("settings.json", { labels: true }, z.object({ labels: z.boolean().catch(true) }));

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));

  const editor = new Editor();
  const mobile = kernel.platform === Platform.MOBILE;

  let camera = $state.raw<Camera>({ orbit: PRESETS[ViewPreset.CAVALIER], pivot: ORIGIN, view: { scale: 0.5, offset_x: 0, offset_y: 0 } });
  let width = $state(0);
  let height = $state(0);
  let fitted = false;
  let root = $state<HTMLElement>();

  let file_path = $state<string | null>(null);
  let untitled = $state(`Untitled${EXTENSION}`);
  let loading = $state(false);
  let notice = $state<string | null>(null);
  let colours_open = $state(false);

  const wire = $derived(editor.wire);
  const file_name = $derived(file_path ? base_name(file_path) : untitled);
  const read_only = $derived(file_path !== null && is_system_path(file_path));
  const directions = $derived(axis_directions(basis(camera.orbit)));
  const overlap = $derived(overlapping(directions));
  const blocked = $derived(overlap ? `${overlap[0].toUpperCase()} and ${overlap[1].toUpperCase()} overlap from here: turn the view to draw` : null);
  const preset = $derived(preset_of(camera.orbit));
  const pivot = $derived(center3(wire));
  const panel_open = $derived(editor.panel !== null);

  $effect(() => win.set_title(file_name));
  $effect(() => win.set_dirty(editor.dirty, { save }));

  $effect(() => {
    if (!notice) return;
    const timer = setTimeout(() => (notice = null), 2800);
    return () => clearTimeout(timer);
  });

  function say(text: string) {
    notice = text;
  }

  function fit() {
    if (!width || !height) return;
    const centre = center3(editor.wire);
    if (!editor.wire.points.length) {
      const scale = Math.min(width, height) / 2600;
      camera = { ...camera, pivot: ORIGIN, view: { scale, offset_x: width * 0.4, offset_y: height * 0.62 } };
      return;
    }
    camera = { ...camera, pivot: centre, view: fitted_view(editor.wire, camera.orbit, centre, width, height, 64, 4) };
  }

  $effect(() => {
    if (fitted || !width || !height) return;
    fitted = true;
    untrack(fit);
  });

  let last_size = { width: 0, height: 0, panel: false };

  // A resized window keeps the middle of the drawing in the middle; a sheet rising from below leaves the top where it was.
  $effect(() => {
    const size = { width, height, panel: panel_open };
    untrack(() => {
      if (last_size.width && last_size.height && size.width && size.height) {
        const dx = (size.width - last_size.width) / 2;
        const dy = size.panel === last_size.panel ? (size.height - last_size.height) / 2 : 0;
        camera = { ...camera, view: { ...camera.view, offset_x: camera.view.offset_x + dx, offset_y: camera.view.offset_y + dy } };
      }
      last_size = size;
    });
  });

  let animation = 0;

  function turn_to(target: Orbit) {
    cancelAnimationFrame(animation);
    const start = repivot(camera, center3(editor.wire));
    camera = start;
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / 260);
      const eased = 1 - (1 - t) ** 3;
      camera = { ...camera, orbit: t >= 1 ? target : lerp_orbit(start.orbit, target, eased) };
      if (t < 1) animation = requestAnimationFrame(step);
    };
    animation = requestAnimationFrame(step);
  }

  $effect(() => () => cancelAnimationFrame(animation));

  async function discard_ok(): Promise<boolean> {
    return !editor.dirty || confirm_discard(win, file_name);
  }

  let open_request = 0;

  async function load(path: string) {
    const id = ++open_request;
    const before = editor.wire;
    loading = true;
    try {
      const opened = await read_path(path);
      if (id !== open_request) return;
      // An edit made while the file was still loading wins: replacing it would lose work without asking.
      if (editor.wire !== before) {
        say(`Didn't open ${base_name(path)}: the drawing changed meanwhile`);
        return;
      }
      editor.load(opened);
      file_path = path;
      untitled = base_name(path);
      camera = { ...camera, orbit: PRESETS[ViewPreset.CAVALIER] };
      fit();
    } catch (reason) {
      if (id === open_request) report_error(app_id, `Couldn't open ${base_name(path)}`, reason);
    } finally {
      if (id === open_request) loading = false;
    }
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({ accept: [EXTENSION], start_path: file_path ? parent_path(file_path) : undefined, title: "Open in Wireframe" });
    if (chosen) await load(chosen);
  }

  async function create() {
    if (!(await discard_ok())) return;
    open_request++;
    loading = false;
    editor.load(create_wire(editor.wire.unit));
    file_path = null;
    untitled = `Untitled${EXTENSION}`;
    fit();
  }

  async function write(path: string): Promise<boolean> {
    const snapshot = editor.wire;
    try {
      await write_file(path, serialize_wire(snapshot));
      file_path = path;
      editor.mark_saved(snapshot);
      notifications.notify(app_id, { title: "Wireframe saved", message: path });
      return true;
    } catch (reason) {
      report_error(app_id, "Couldn't save the wireframe", reason);
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const path = await win.pick_save({
      name: wire_name_for(file_name, file_stem(file_name)),
      accept: [EXTENSION],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
      title: "Save wireframe",
    });
    if (!path) return false;
    return write(path.toLowerCase().endsWith(EXTENSION) ? path : `${path}${EXTENSION}`);
  }

  function save(): Promise<boolean> {
    return file_path && !read_only ? write(file_path) : save_as();
  }

  async function export_as(format: "png" | "svg") {
    const svg = wire_svg(editor.wire, camera.orbit, center3(editor.wire), theme_palette(), settings.value.labels);
    if (!svg) {
      say("Nothing to export yet");
      return;
    }
    const path = await win.pick_save({
      name: `${file_stem(file_name) || "wireframe"}.${format}`,
      accept: format === "png" ? [".png", "image/png"] : [".svg", "image/svg+xml"],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
      title: `Export as ${format.toUpperCase()}`,
    });
    if (!path) return;
    const target = path.toLowerCase().endsWith(`.${format}`) ? path : `${path}.${format}`;
    try {
      await write_file(target, format === "png" ? await svg_to_png(svg) : new Blob([svg], { type: "image/svg+xml" }));
      notifications.notify(app_id, { title: "Wireframe exported", message: target, actions: [{ label: "Open", on_click: () => void apps.open(target) }] });
    } catch (reason) {
      report_error(app_id, "Couldn't export the wireframe", reason);
    }
  }

  function merge() {
    let merged = 0;
    editor.apply((value) => {
      const result = merge_coincident(value);
      merged = result.merged;
      return result.wire;
    });
    say(merged ? `Merged ${merged} ${merged === 1 ? "point" : "points"}` : "No points share a place");
  }

  function below(event: MouseEvent): { x: number; y: number } {
    const target = event.currentTarget;
    if (!(target instanceof Element)) return { x: event.clientX, y: event.clientY };
    const box = target.getBoundingClientRect();
    return { x: box.left, y: box.bottom + 4 };
  }

  async function file_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      [
        { id: "new", label: "New wireframe", icon: FilePlusIcon },
        { id: "open", label: "Open…", icon: FolderOpenIcon, shortcut: "Mod+O" },
        { id: "save", label: "Save", icon: FloppyDiskIcon, shortcut: "Mod+S" },
        { id: "save-as", label: "Save as…", icon: FloppyDiskBackIcon, shortcut: "Mod+Shift+S" },
        { separator: true },
        { id: "png", label: "Export PNG…", icon: ExportIcon },
        { id: "svg", label: "Export SVG…", icon: ExportIcon },
        { separator: true },
        { id: "all", label: "Select all", shortcut: "Mod+A" },
        { id: "paste", label: "Paste", icon: ClipboardTextIcon, shortcut: "Mod+V" },
        { id: "merge", label: "Merge overlapping points", icon: GitMergeIcon },
      ],
      { anchor: below(event) }
    );
    if (choice === "new") void create();
    else if (choice === "open") void open();
    else if (choice === "save") void save();
    else if (choice === "save-as") void save_as();
    else if (choice === "png" || choice === "svg") void export_as(choice);
    else if (choice === "all") select_all();
    else if (choice === "paste") void paste();
    else if (choice === "merge") merge();
  }

  const VIEW_ORDER: ViewPreset[] = [ViewPreset.CAVALIER, ViewPreset.ISOMETRIC, ViewPreset.FRONT, ViewPreset.SIDE, ViewPreset.TOP];

  async function view_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      [
        ...VIEW_ORDER.map((each, i) => ({
          id: each,
          label: `${PRESET_LABELS[each]}${each === preset ? " ✓" : ""}`,
          shortcut: mobile ? undefined : `Alt+${i + 1}`,
        })),
        { separator: true },
        { id: "labels", label: `All lengths${settings.value.labels ? " ✓" : ""}`, icon: TagIcon, shortcut: mobile ? undefined : "Shift+L" },
        { id: "fit", label: "Fit the drawing", icon: CornersOutIcon, shortcut: "Mod+0" },
      ],
      { anchor: below(event) }
    );
    if (choice === "fit") fit();
    else if (choice === "labels") toggle_labels();
    else if (choice && choice in PRESETS) turn_to(PRESETS[choice as ViewPreset]);
  }

  async function unit_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      UNITS.map((unit) => ({ id: unit, label: `${UNIT_LABELS[unit]} (${unit})${unit === wire.unit ? " ✓" : ""}` })),
      { anchor: below(event) }
    );
    if (!choice || choice === wire.unit) return;
    editor.apply((value) => set_unit(value, choice as Unit));
    editor.clear_length();
  }

  interface ToolInfo {
    id: Tool;
    label: string;
    icon: Component<{ class?: string; weight?: "bold" | "fill" | "regular" }>;
    key: string;
  }

  const TOOLS: ToolInfo[] = [
    { id: Tool.SELECT, label: "Select", icon: CursorIcon, key: "v" },
    { id: Tool.DRAW, label: "Draw", icon: PencilSimpleLineIcon, key: "d" },
    { id: Tool.SLOPE, label: "Slope", icon: LineSegmentIcon, key: "l" },
    { id: Tool.POINT, label: "Point", icon: CrosshairIcon, key: "p" },
    { id: Tool.BOX, label: "Box", icon: CubeIcon, key: "b" },
  ];

  function focus_canvas() {
    root?.querySelector<SVGElement>("svg.canvas")?.focus({ preventScroll: true });
  }

  function toggle_labels() {
    settings.value.labels = !settings.value.labels;
    say(settings.value.labels ? "Showing every length" : "Lengths only for the selection");
  }

  function set_tool(tool: Tool) {
    editor.op = null;
    editor.place = null;
    editor.clear_length();
    editor.slope_from = null;
    const single = editor.selection.points.length === 1 && !editor.selection.lines.length ? editor.selection.points[0] : null;
    if (tool === Tool.DRAW && single) editor.from = single;
    editor.tool = tool;
    if ((tool === Tool.POINT || tool === Tool.BOX) && single) void (tool === Tool.POINT ? place_point(single) : place_box(single));
    if (tool !== Tool.SELECT) editor.clear_selection();
  }

  function start_op(op: Op) {
    if (editor.tool !== Tool.SELECT) editor.tool = Tool.SELECT;
    editor.place = null;
    editor.clear_length();
    editor.op = op;
    focus_canvas();
  }

  function close_panel() {
    if (editor.op) {
      editor.op = null;
      editor.clear_length();
    } else set_tool(Tool.SELECT);
  }

  function select_all() {
    editor.select({ points: [], lines: editor.wire.lines.map((line) => line.id), faces: editor.wire.faces.map((face) => face.id) });
    if (editor.tool !== Tool.SELECT) {
      editor.tool = Tool.SELECT;
      editor.clear_length();
    }
  }

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((each) => each !== id) : [...list, id];
  }

  function tap_select(hit: Hit | null, shift: boolean) {
    const selection = editor.selection;
    if (!hit || hit.kind === "origin") {
      if (!shift) editor.clear_selection();
      return;
    }
    const key = hit.kind === "point" ? "points" : hit.kind === "line" ? "lines" : "faces";
    // A phone has no Shift: once lines are selected, tapping more lines adds them, so a loop can be picked for Fill.
    const adding = mobile && key === "lines" && selection.lines.length > 0 && !selection.points.length && !selection.faces.length;
    if (shift || adding) editor.select({ ...selection, [key]: toggle(selection[key], hit.id) });
    else editor.select({ points: [], lines: [], faces: [], [key]: [hit.id] } as Selection);
  }

  async function ask_numbers(message: string, count: number, initial: string, placeholder: string): Promise<number[] | null> {
    const text = await win.prompt(message, {
      initial,
      placeholder,
      confirm_label: "OK",
      validate: (value) => {
        const numbers = parse_numbers(value, editor.wire.unit);
        return numbers && numbers.length === count ? null : `Type ${count} numbers in ${editor.wire.unit}`;
      },
    });
    if (text === null) return null;
    return parse_numbers(text, editor.wire.unit);
  }

  async function place_point(from: string | null) {
    const numbers = await ask_numbers(`Offset X, Y, Z from ${from ? "this point" : "the origin"}, in ${editor.wire.unit}`, 3, "", "0, 0, 100");
    if (!numbers) return;
    const [x, y, z] = numbers;
    let id = "";
    editor.apply((value) => {
      const added = add_offset_point(value, from, { x, y, z });
      id = added.id;
      return added.wire;
    });
    editor.tool = Tool.DRAW;
    editor.from = id;
    editor.clear_length();
    focus_canvas();
  }

  async function place_box(from: string | null) {
    const numbers = await ask_numbers(`Box from ${from ? "this corner" : "the origin"}: width × depth × height in ${editor.wire.unit}`, 3, "", "80 x 40 x 200");
    if (!numbers) return;
    const [x, y, z] = numbers;
    if (!x || !y || !z) {
      say("A box needs all three sizes");
      return;
    }
    let lines: string[] = [];
    editor.apply((value) => {
      const added = add_box(value, from, { x, y, z }, editor.ink);
      lines = added.lines;
      return added.wire;
    });
    editor.tool = Tool.SELECT;
    editor.select({ points: [], lines, faces: [] });
    focus_canvas();
  }

  function on_tap(hit: Hit | null, shift: boolean) {
    focus_canvas();
    const tool = editor.tool;
    if (editor.place) place_tap(hit);
    else if (tool === Tool.SELECT) tap_select(hit, shift);
    else if (tool === Tool.DRAW) {
      if (hit?.kind === "point") {
        editor.from = hit.id;
        editor.clear_length();
      } else if (hit?.kind === "origin") editor.from = null;
    } else if (tool === Tool.SLOPE) {
      if (hit?.kind !== "point") return;
      const from = editor.slope_from;
      if (!from || from === hit.id) {
        editor.slope_from = from === hit.id ? null : hit.id;
        return;
      }
      const to = hit.id;
      editor.apply((value) => add_line(value, from, to, editor.ink).wire);
      editor.slope_from = null;
    } else if (tool === Tool.POINT || tool === Tool.BOX) {
      const from = hit?.kind === "point" ? hit.id : hit?.kind === "origin" || !editor.wire.points.length ? null : undefined;
      if (from === undefined) return;
      void (tool === Tool.POINT ? place_point(from) : place_box(from));
    }
  }

  function start_position(): Vec3 | null {
    if (editor.from !== null) return position(editor.wire, editor.from);
    return editor.wire.points.length ? null : ORIGIN;
  }

  function on_ray(from: Vec3, direction: { axis: Axis; sign: 1 | -1 }, id: string): number | null {
    const target = position(editor.wire, id);
    if (!target) return null;
    const d = sub3(target, from);
    const along = d[direction.axis] * direction.sign;
    const others = AXES.filter((axis) => axis !== direction.axis);
    return others.every((axis) => Math.abs(d[axis]) < 0.005) && along > 0 ? along : null;
  }

  // Of the points under the pointer, the one the stroke's ray reaches: two corners can share a pixel.
  function suggestion(from: Vec3, direction: AxisDirection, event: StrokeEvent): { length: number; snap: string | null } {
    for (const hit of event.over) {
      if (hit.kind !== "point") continue;
      const along = on_ray(from, direction, hit.id);
      if (along !== null) return { length: along, snap: hit.id };
    }
    return { length: round_drag(drag_length(direction, event.toward, camera.view.scale), direction.reach, camera.view.scale), snap: null };
  }

  function pending_length(): number | null {
    const from = start_position();
    if (editor.snap && !editor.typed && editor.pending && from) return on_ray(from, editor.pending, editor.snap);
    return parse_input(editor.input, editor.wire.unit);
  }

  function on_stroke(event: StrokeEvent) {
    if (blocked) {
      if (event.done) say(blocked);
      return;
    }
    const direction = nearest_axis(directions, event.toward);
    if (!direction) return;
    editor.from = event.from;
    const from = start_position();
    if (!from) return;
    editor.pending = { axis: direction.axis, sign: direction.sign };
    if (!editor.typed || !event.done) {
      const suggested = suggestion(from, direction, event);
      editor.suggest(input_for(suggested.length, editor.wire.unit), suggested.snap);
    }
    if (event.done) focus_canvas();
  }

  function walk_along(axis: Axis, sign: 1 | -1, length: number) {
    const from = editor.from;
    let point = "";
    editor.apply((value) => {
      const result = walk(value, from, axis, sign, length, editor.ink);
      point = result.point;
      return result.wire;
    });
    editor.from = point;
    editor.clear_length();
    const end = position(editor.wire, point);
    if (end) keep_visible(end);
  }

  // The next stroke starts at the end of this one, so it has to stay on screen; the sheet below the canvas is already outside it.
  function keep_visible(p: Vec3) {
    if (!width || !height) return;
    const at = projector(camera).project(p);
    const margin = Math.min(64, width / 4, height / 4);
    const dx = at.x < margin ? margin - at.x : at.x > width - margin ? width - margin - at.x : 0;
    const dy = at.y < margin ? margin - at.y : at.y > height - margin ? height - margin - at.y : 0;
    if (dx || dy) camera = { ...camera, view: { ...camera.view, offset_x: camera.view.offset_x + dx, offset_y: camera.view.offset_y + dy } };
  }

  function commit_pending() {
    const pending = editor.pending;
    const length = pending_length();
    if (!pending) return;
    if (length === null) {
      say("Type a length first");
      return;
    }
    if (!start_position()) return;
    walk_along(pending.axis, pending.sign, length);
  }

  function selected_lines(): string[] {
    return [...new Set([...editor.selection.lines, ...face_lines(editor.wire, editor.selection.faces)])];
  }

  function selected_points(): string[] {
    const faces = new Set(editor.selection.faces);
    const corners = editor.wire.faces.filter((face) => faces.has(face.id)).flatMap((face) => face.points);
    return [...new Set([...editor.selection.points, ...line_points(editor.wire, editor.selection.lines), ...corners])];
  }

  const has_selection = () => editor.selection.points.length + editor.selection.lines.length + editor.selection.faces.length > 0;

  function selected_part() {
    const { points, lines, faces } = editor.selection;
    return extract_part(editor.wire, points, lines, faces);
  }

  function start_place(kind: PlaceKind) {
    if (!has_selection()) {
      say(kind === PlaceKind.MOVE ? "Select what to move" : "Select what to duplicate");
      return;
    }
    if (editor.tool !== Tool.SELECT) editor.tool = Tool.SELECT;
    editor.op = null;
    editor.clear_length();
    editor.place = { kind, part: selected_part(), handle: null };
    focus_canvas();
  }

  function cancel_place() {
    editor.place = null;
    cursor = null;
  }

  async function copy_selection() {
    const part = selected_part();
    const text = has_selection() ? clip_text(part, editor.wire.unit) : null;
    if (!text) {
      say("Select lines to copy");
      return;
    }
    try {
      await clipboard.copy_text(text);
      const lines = part.lines.length;
      const faces = part.faces.length;
      say(`Copied ${lines} ${lines === 1 ? "line" : "lines"}${faces ? ` and ${faces} ${faces === 1 ? "face" : "faces"}` : ""}`);
    } catch (reason) {
      report_error(app_id, "Couldn't copy to the clipboard", reason);
    }
  }

  async function paste() {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      say("The clipboard can't be read here");
      return;
    }
    const part = parse_clip(text);
    const anchor = part && anchor_of(part);
    if (!part || !anchor) {
      say("The clipboard doesn't hold Wireframe lines");
      return;
    }
    if (editor.tool !== Tool.SELECT) editor.tool = Tool.SELECT;
    editor.op = null;
    editor.clear_length();
    editor.place = { kind: PlaceKind.PASTE, part, handle: anchor.id };
    focus_canvas();
  }

  function place_tap(hit: Hit | null) {
    const place = editor.place;
    if (!place) return;
    if (!place.handle) {
      if (hit?.kind === "point" && place.part.points.some((point) => point.id === hit.id)) editor.place = { ...place, handle: hit.id };
      else say("Tap a corner of the selection to hold it by");
      return;
    }
    const target = hit?.kind === "point" ? position(editor.wire, hit.id) : hit?.kind === "origin" ? ORIGIN : null;
    if (!target) {
      say("Tap a point to drop it on");
      return;
    }
    const handle = place.part.points.find((point) => point.id === place.handle)!;
    const shift = sub3(target, handle);
    if (place.kind === PlaceKind.MOVE) {
      editor.apply((value) => translate(value, place.part.points.map((point) => point.id), shift));
    } else {
      let made = { lines: [] as string[], faces: [] as string[] };
      editor.apply((value) => {
        const result = place_part(value, place.part, shift);
        made = result;
        return result.wire;
      });
      editor.select({ points: [], lines: made.lines, faces: made.faces });
    }
    cancel_place();
  }

  function fill_selection() {
    const lines = editor.selection.lines;
    if (!lines.length) {
      say("Select the lines round the face first");
      return;
    }
    let made: string | null = null;
    let refused: string | null = null;
    editor.apply((value) => {
      const result = fill(value, lines);
      if ("refused" in result) {
        refused = result.refused;
        return value;
      }
      made = result.id;
      return result.wire;
    });
    if (refused) say(refused);
    else if (made) editor.select({ points: [], lines: [], faces: [made] });
  }

  let cursor = $state<{ x: number; y: number } | null>(null);
  let cursor_point = $state<string | null>(null);

  function on_hover(at: { x: number; y: number } | null, hit: Hit | null) {
    if (!editor.place) return;
    cursor = at;
    cursor_point = hit?.kind === "point" ? hit.id : null;
  }

  const placing = $derived.by<PlaceGhost | null>(() => {
    const place = editor.place;
    if (!place?.handle || !cursor) return null;
    const handle = place.part.points.find((point) => point.id === place.handle);
    if (!handle) return null;
    const project = projector(camera);
    const over = cursor_point ? position(wire, cursor_point) : null;
    const at = over ? project.project(over) : cursor;
    const corners = new Map(
      place.part.points.map((point) => {
        const d = project.direction(sub3(point, handle));
        return [point.id, { x: at.x + d.x, y: at.y + d.y }];
      })
    );
    return {
      at,
      lines: place.part.lines.map((line) => ({ id: line.id, a: corners.get(line.a)!, b: corners.get(line.b)! })),
      faces: place.part.faces.map((face) => ({ id: face.id, points: face.points.map((id) => corners.get(id)!) })),
    };
  });

  function pick(direction: { axis: Axis; sign: 1 | -1 }) {
    if (blocked) {
      say(blocked);
      return;
    }
    const op = editor.panel;
    const length = parse_input(editor.input, editor.wire.unit);
    if (op === Op.WALK) {
      if (!start_position()) {
        say("Tap a point to draw from");
        return;
      }
      if (length === null || !editor.typed) {
        editor.pending = direction;
        if (length === null) editor.suggest("");
        return;
      }
      walk_along(direction.axis, direction.sign, length);
      return;
    }
    if (length === null) {
      say("Type a length first");
      return;
    }
    const distance = length * direction.sign;
    const lines = selected_lines();
    if (op === Op.MOVE) {
      const ids = selected_points();
      editor.apply((value) => move_points(value, ids, direction.axis, distance));
    } else if (op === Op.EXTRUDE || op === Op.COPY) {
      let made: string[] = [];
      editor.apply((value) => {
        const result = op === Op.EXTRUDE ? extrude(value, lines, direction.axis, distance) : copy_along(value, lines, direction.axis, distance, editor.count);
        made = result.lines;
        return result.wire;
      });
      if (made.length) editor.select({ points: [], lines: made, faces: [] });
    }
    editor.op = null;
    editor.clear_length();
  }

  function delete_selection() {
    const { points, lines, faces } = editor.selection;
    if (!points.length && !lines.length && !faces.length) return;
    editor.apply((value) => delete_items(value, points, lines, faces));
    editor.clear_selection();
  }

  function choose_ink(color: Ink) {
    editor.ink = color;
    const { lines, faces } = editor.selection;
    if (lines.length || faces.length) editor.apply((value) => set_color(value, lines, color, faces));
  }

  let custom_value = $state("#3584e4");

  const ghost = $derived.by(() => {
    if (editor.panel !== Op.WALK || !editor.pending) return null;
    const from = start_position();
    const length = pending_length();
    if (!from || length === null) return null;
    const end = walk_end(from, editor.pending.axis, editor.pending.sign, length);
    const lands = point_at(wire, end);
    return { a: from, b: end, text: `${format_length(length, wire.unit)}${lands ? " ●" : ""}` };
  });

  const guides = $derived(editor.tool === Tool.DRAW && !blocked ? start_position() : null);

  const selected_count = $derived.by(() => {
    const { points, lines, faces } = editor.selection;
    const parts: string[] = [];
    if (faces.length) parts.push(`${faces.length} ${faces.length === 1 ? "face" : "faces"}`);
    if (lines.length) parts.push(`${lines.length} ${lines.length === 1 ? "line" : "lines"}`);
    if (points.length) parts.push(`${points.length} ${points.length === 1 ? "point" : "points"}`);
    return parts.join(", ");
  });

  const selected_length = $derived.by(() => {
    if (editor.selection.lines.length !== 1 || editor.selection.points.length || editor.selection.faces.length) return null;
    const line = wire.lines.find((each) => each.id === editor.selection.lines[0]);
    const a = line && position(wire, line.a);
    const b = line && position(wire, line.b);
    return a && b ? format_length(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), wire.unit) : null;
  });

  const panel_ready = $derived.by(() => {
    const op = editor.panel;
    if (op === Op.WALK) return start_position() !== null;
    if (op === Op.MOVE) return has_selection();
    return editor.selection.lines.length + editor.selection.faces.length > 0;
  });

  const panel_hint = $derived.by(() => {
    const op = editor.panel;
    if (op === Op.WALK) {
      if (!start_position()) return "Tap a point to draw from";
      if (editor.pending) return "Type the length, then Enter or ✓";
      return mobile ? "Type a length, then tap a direction" : "Drag from the point along an axis, or type a length and press X, Y or Z";
    }
    if (!panel_ready) return op === Op.MOVE ? "Select what to move" : "Select the lines first";
    const what = op === Op.MOVE ? "Move by" : op === Op.EXTRUDE ? "Extrude by" : "Step";
    return `${what} a length, then pick a direction`;
  });

  const PLACE_TITLES: Record<PlaceKind, string> = {
    [PlaceKind.MOVE]: "Move",
    [PlaceKind.DUPLICATE]: "Duplicate",
    [PlaceKind.PASTE]: "Paste",
  };

  const hint = $derived.by(() => {
    const tool = editor.tool;
    const place = editor.place;
    if (place) {
      const what = PLACE_TITLES[place.kind];
      if (!place.handle) return `${what}: tap the corner to hold it by`;
      return wire.points.length ? `${what}: tap the point to drop it on` : `${what}: tap the origin`;
    }
    if (tool === Tool.SLOPE) return editor.slope_from ? "Tap the other end" : "Tap two points to join them";
    if (tool === Tool.POINT) return wire.points.length ? "Tap the point to measure from" : "Tap the origin";
    if (tool === Tool.BOX) return wire.points.length ? "Tap the corner the box grows from" : "Tap the origin";
    if (tool === Tool.SELECT && !selected_count) return wire.lines.length ? (mobile ? "Tap a line or a point; tap more lines to add them" : "Click a line or a point; Shift adds to the selection") : "Pick Draw or Box to start";
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

  function axis_key(event: KeyboardEvent): { axis: Axis; sign: 1 | -1 } | null {
    const key = event.key.toLowerCase();
    if (key !== "x" && key !== "y" && key !== "z") return null;
    return { axis: key, sign: event.shiftKey ? -1 : 1 };
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!(event.target instanceof Element) || event.target.closest("input, textarea, [contenteditable]")) return;
    const typed = digit(event);
    if (editor.panel) {
      const along = axis_key(event);
      if (typed) editor.press(typed);
      else if (along) {
        if (directions.some((each) => each.axis === along.axis)) pick(along);
        else say(`${along.axis.toUpperCase()} points straight at you from here`);
      } else if (event.key === "Enter") commit_pending();
      else if (event.key === "Delete") editor.suggest("");
      else if (event.key === "Escape") {
        if (editor.pending || editor.input) editor.clear_length();
        else close_panel();
      } else return;
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      if (editor.place) cancel_place();
      else if (editor.slope_from) editor.slope_from = null;
      else editor.clear_selection();
    } else if (event.key === "Delete" || event.key === "Backspace") delete_selection();
    else return;
    event.preventDefault();
  }

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `wireframe.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    // Copy and paste in a text field (a prompt, the colour input) stay the browser's own.
    const typing_aside = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({
        id: `wireframe.${id}`,
        keys,
        label,
        category: ShortcutCategory.APP,
        window: window_id,
        run,
        when: () => !(document.activeElement instanceof Element && document.activeElement.matches("input, textarea, [contenteditable]")),
      });
    const disposers = [
      scoped("undo", "mod+z", "Undo", () => editor.undo()),
      scoped("redo", "mod+shift+z", "Redo", () => editor.redo()),
      scoped("redo-alt", "mod+y", "Redo", () => editor.redo()),
      scoped("open", "mod+o", "Open…", open),
      scoped("save", "mod+s", "Save", save),
      scoped("save-as", "mod+shift+s", "Save as…", save_as),
      scoped("fit", "mod+0", "Fit the drawing", fit),
      scoped("all", "mod+a", "Select all", select_all),
      typing_aside("clip-copy", "mod+c", "Copy the selection", () => void copy_selection()),
      typing_aside("clip-paste", "mod+v", "Paste and place", () => void paste()),
      scoped("duplicate", "mod+d", "Duplicate and place", () => start_place(PlaceKind.DUPLICATE)),
      scoped("place", "g", "Move by points", () => start_place(PlaceKind.MOVE)),
      scoped("fill", "f", "Fill the selected loop", fill_selection),
      scoped("labels", "shift+l", "Show every length", toggle_labels),
      ...TOOLS.map((tool) => scoped(`tool.${tool.id}`, tool.key, tool.label, () => set_tool(tool.id))),
      scoped("move", "m", "Move the selection by a length", () => start_op(Op.MOVE)),
      scoped("extrude", "e", "Extrude the selected lines", () => start_op(Op.EXTRUDE)),
      scoped("copy", "c", "Copy the selected lines along an axis", () => start_op(Op.COPY)),
      ...VIEW_ORDER.map((each, i) => scoped(`view.${each}`, `alt+${i + 1}`, `${PRESET_LABELS[each]} view`, () => turn_to(PRESETS[each]))),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  $effect(() =>
    win.on_back(() => {
      if (colours_open) colours_open = false;
      else if (editor.place) cancel_place();
      else if (editor.panel) close_panel();
      else if (has_selection()) editor.clear_selection();
      else return false;
      return true;
    })
  );

  onMount(() => {
    const path = untrack(() => initial_path);
    if (path) void load(path);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class={cn("wire bg-background", panel_open && "panel-open")} onkeydown={on_keydown}>
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
    <Button size="sm" variant="quiet" class="shrink-0 gap-1.5 pr-1.5" aria-label="Line colour: {ink_label(editor.ink)}" aria-expanded={colours_open} onclick={() => (colours_open = !colours_open)}>
      <span class="size-3.5 rounded-full ring-1 ring-foreground/30" style:background={ink_css(editor.ink)}></span>
      <CaretDownIcon weight="bold" class="size-3 opacity-65 @max-[26rem]:hidden" />
    </Button>
    <Button size="sm" variant="quiet" class="shrink-0 gap-1 pr-1.5" aria-label="View: {preset ? PRESET_LABELS[preset] : 'turned'}" onclick={view_menu}>
      <EyeIcon weight="bold" /><span class="@max-[26rem]:hidden">{preset ? PRESET_LABELS[preset] : "Turned"}</span><CaretDownIcon weight="bold" class="size-3 opacity-65" />
    </Button>
    <Button size="sm" variant="quiet" class="shrink-0 gap-1 pr-1.5 font-mono" aria-label="Units: {UNIT_LABELS[wire.unit]}" onclick={unit_menu}>
      <RulerIcon weight="bold" />{wire.unit}<CaretDownIcon weight="bold" class="size-3 opacity-65" />
    </Button>
    <IconButton label="Fit the drawing (Mod+0)" size="sm" class="shrink-0 @max-[26rem]:hidden" onclick={fit}><CornersOutIcon weight="bold" /></IconButton>
  </Toolbar>

  {#if colours_open}
    <div class="area-colours flex flex-wrap items-center gap-1.5 border-b border-foreground/8 bg-background-light px-2 py-1.5" role="radiogroup" aria-label="Line colour">
      {#each [null, ...LINE_COLORS] as color (color ?? "ink")}
        {@const on = editor.ink === color}
        <button
          type="button"
          role="radio"
          aria-checked={on}
          title={ink_label(color)}
          aria-label={ink_label(color)}
          class="grid size-8 place-items-center rounded-full pointer-coarse:size-10"
          onclick={() => choose_ink(color)}
        >
          <span
            class={cn("size-5 rounded-full ring-offset-2 ring-offset-background-light", color === null ? "bg-foreground" : SWATCH[color], on ? "ring-2 ring-foreground/80" : "ring-1 ring-foreground/20")}
          ></span>
        </button>
      {/each}
      <label class="relative grid size-8 cursor-pointer place-items-center rounded-full pointer-coarse:size-10" title="Custom colour">
        <input
          type="color"
          class="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label="Custom colour"
          bind:value={custom_value}
          onchange={() => is_hex(custom_value) && choose_ink(custom_value)}
        />
        <span
          class={cn("pointer-events-none grid size-5 place-items-center rounded-full ring-offset-2 ring-offset-background-light", is_hex(editor.ink) ? "ring-2 ring-foreground/80" : "ring-1 ring-foreground/30")}
          style:background={is_hex(editor.ink) ? editor.ink : undefined}
        >
          {#if !is_hex(editor.ink)}<PaletteIcon class="size-3.5 text-foreground/80" weight="bold" />{/if}
        </span>
      </label>
      <span class="min-w-0 flex-1 truncate px-1 text-2xs text-foreground/65">
        {editor.selection.lines.length || editor.selection.faces.length ? "Recolours the selection and what you draw next" : "For what you draw next"}
      </span>
    </div>
  {/if}

  <div class="area-stage relative grid min-h-0 min-w-0">
    <WireframeCanvas
      {editor}
      bind:camera
      bind:width
      bind:height
      {pivot}
      {ghost}
      {guides}
      labels={settings.value.labels}
      handle={editor.place?.kind === PlaceKind.PASTE ? null : (editor.place?.handle ?? null)}
      {placing}
      onhover={on_hover}
      ontap={on_tap}
      onstroke={on_stroke}
      onturn={() => cancelAnimationFrame(animation)}
    />

    <div class="pointer-events-none absolute bottom-1 left-1 opacity-90">
      <WireframeGizmo basis={basis(camera.orbit)} />
    </div>

    {#if !wire.points.length && !loading}
      <div class="pointer-events-none absolute inset-x-0 top-6 grid place-items-center p-6 text-center">
        <div class="max-w-72 text-ui text-foreground/65">
          {mobile ? "Type a length and tap a direction to draw from the origin. Two fingers turn the view." : "Drag from the origin along an axis and type the length. Right-drag turns the view, the wheel zooms."}
        </div>
      </div>
    {/if}

    {#if loading}
      <div class="absolute inset-0 grid place-items-center bg-background-darker/70"><Spinner label="Opening wireframe" /></div>
    {/if}
    {#if notice}
      <div class="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-4" aria-live="polite">
        <span class="rounded-full bg-background-lighter px-3 py-1 text-center text-ui shadow-popover">{notice}</span>
      </div>
    {/if}
  </div>

  <div class="area-panel min-w-0">
    {#if editor.panel}
      <WireframePanel {editor} {directions} {blocked} ready={panel_ready} hint={panel_hint} onpick={pick} oncommit={commit_pending} ondone={close_panel} />
    {/if}
  </div>

  <div class="area-dock flex flex-col border-t border-foreground/8 bg-background-light">
    {#if hint || selected_count}
      <div class="flex min-h-11 items-center gap-1 overflow-x-auto px-2 py-1 [&>*]:shrink-0">
        {#if hint}<span class="min-w-0 shrink! truncate px-1 text-2xs text-foreground/65">{hint}</span>{/if}
        {#if editor.place}
          <span class="flex-1"></span>
          {#if editor.place.kind === PlaceKind.MOVE}
            <Button size="sm" variant="secondary" onclick={() => start_op(Op.MOVE)}><RulerIcon weight="bold" />By length</Button>
          {/if}
          <Button size="sm" variant="secondary" onclick={cancel_place}>Cancel</Button>
        {:else if selected_count && editor.tool === Tool.SELECT}
          <span class="min-w-0 shrink! truncate px-1 text-2xs text-foreground/80">
            {selected_count}{#if selected_length}<span class="font-mono"> · {selected_length}</span>{/if}
          </span>
          <span class="flex-1"></span>
          {#if editor.selection.points.length === 1 && !editor.selection.lines.length}
            <Button size="sm" variant="secondary" onclick={() => set_tool(Tool.DRAW)}><PencilSimpleLineIcon weight="bold" />Draw from here</Button>
          {/if}
          <Button size="sm" variant="secondary" aria-label="Move" title="Move by points (G), or by a length (M)" pressed={editor.op === Op.MOVE} onclick={() => start_place(PlaceKind.MOVE)}><ArrowsOutCardinalIcon weight="bold" /><span class="@max-[34rem]:hidden">Move</span></Button>
          {#if editor.selection.lines.length || editor.selection.faces.length}
            <Button size="sm" variant="secondary" aria-label="Extrude" title="Extrude (E)" pressed={editor.op === Op.EXTRUDE} onclick={() => start_op(Op.EXTRUDE)}><StackIcon weight="bold" /><span class="@max-[34rem]:hidden">Extrude</span></Button>
            <Button size="sm" variant="secondary" aria-label="Copy along" title="Copy along an axis (C)" pressed={editor.op === Op.COPY} onclick={() => start_op(Op.COPY)}><CopyIcon weight="bold" /><span class="@max-[34rem]:hidden">Copy along</span></Button>
          {/if}
          {#if editor.selection.lines.length >= 3}
            <IconButton label="Fill (F)" size="md" onclick={fill_selection}><PaintBucketIcon weight="bold" /></IconButton>
          {/if}
          <IconButton label="Duplicate (Mod+D)" size="md" onclick={() => start_place(PlaceKind.DUPLICATE)}><CopySimpleIcon weight="bold" /></IconButton>
          <IconButton label="Copy (Mod+C)" size="md" onclick={() => void copy_selection()}><ClipboardIcon weight="bold" /></IconButton>
          <IconButton label="Paste (Mod+V)" size="md" onclick={() => void paste()}><ClipboardTextIcon weight="bold" /></IconButton>
          <IconButton label="Delete" size="md" onclick={delete_selection}><TrashIcon weight="bold" /></IconButton>
        {/if}
      </div>
    {/if}
    <div class="grid grid-cols-5 gap-0.5 px-1 pt-1 pb-1.5" role="toolbar" aria-label="Tools">
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
  .wire {
    container-type: size;
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr) auto auto;
    grid-template-areas: "bar" "colours" "stage" "panel" "dock";
  }

  .wire :global(.area-bar) {
    grid-area: bar;
  }

  .area-colours {
    grid-area: colours;
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

  @container (width < 46rem) {
    .panel-open .area-dock > :last-child {
      display: none;
    }
  }

  @container (width >= 46rem) {
    .wire.panel-open {
      grid-template-columns: minmax(0, 1fr) 21rem;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      grid-template-areas: "bar bar" "colours colours" "stage panel" "dock panel";
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

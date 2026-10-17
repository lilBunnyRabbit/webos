<script lang="ts">
  import kernel, { NotificationType, type FilesService, type NotificationsService, type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time, Stopwatch, track_play } from "$lib/core/games";
  import { BoardOverlay, Button, EmptyState, IconButton, Select, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn, error_message } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { has_files, image_files } from "$lib/core/utils/image";
  import { random_seed } from "$lib/core/utils/random";
  import {
    CornersOut as FitIcon,
    Devices as DevicesIcon,
    Eye as EyeIcon,
    FrameCorners as FrameCornersIcon,
    ImageSquare as ImageSquareIcon,
    MagnifyingGlassMinus as ZoomOutIcon,
    MagnifyingGlassPlus as ZoomInIcon,
    PuzzlePiece as PuzzlePieceIcon,
    Shuffle as ShuffleIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { fit_view, pinch_view, to_image, zoom_view, type Point, type View } from "../image-tools/sprite-sheet";
  import {
    bounds,
    create_board,
    drop,
    fits,
    group_count,
    inner_groups,
    is_complete,
    is_placed,
    members,
    move_group,
    piece_total,
    pieces_schema,
    placed_count,
    positions_of,
    raise,
    saved_schema,
    scatter,
    settle,
    type Board,
    type Saved,
  } from "./board";
  import { cut, grid_for, piece_counts, tab_margin, type Cuts, type PieceCount } from "./cuts";
  import { draw, load_picture, piece_at, read_palette, render_pieces, type Palette, type Sprite } from "./render";

  const EMPTY = new Set<number>();
  const ZOOM_STEP = 1.25;

  const { path: path_prop }: { path?: string } = $props();

  const { app_id, window: win, storage } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const clock = new Stopwatch(() => win.is_visible);

  let pieces = $state<PieceCount>(storage.get("pieces", pieces_schema) ?? 48);
  let picture = $state.raw<ImageBitmap | null>(null);
  let source_path = $state<string | null>(null);
  let source_name = $state("");
  let cuts = $state.raw<Cuts | null>(null);
  let seed = 0;
  let board = $state.raw<Board | null>(null);
  let sprites = $state.raw<Sprite[]>([]);
  let revision = $state(0);
  let view = $state.raw<View | null>(null);
  let edge_only = $state(false);
  let ghost = $state(false);
  let solved = $state(false);
  let loading = $state(false);
  let dragging_file = $state(false);
  let lifted = $state.raw<Set<number> | null>(null);
  let palette = $state.raw<Palette | null>(null);
  let size = $state({ width: 0, height: 0, dpr: 1 });
  let canvas = $state<HTMLCanvasElement>();
  let root = $state<HTMLDivElement>();

  const total = $derived(cuts ? piece_total(cuts.layout) : 0);
  const counts = $derived.by(() => {
    revision;
    return board ? { placed: placed_count(board), groups: group_count(board) } : { placed: 0, groups: 0 };
  });
  const hidden = $derived.by(() => {
    revision;
    return board && edge_only ? inner_groups(board) : EMPTY;
  });
  const fitting = $derived(size.width ? piece_counts(size.width, size.height) : [pieces]);
  const count_options = $derived(
    [...new Set<PieceCount>([...fitting, ...(cuts ? [pieces] : [])])].sort((a, b) => a - b).map((value) => ({ value: String(value), label: `${value} pieces` }))
  );
  const elapsed = $derived(clock.elapsed);
  const status = $derived.by(() => {
    if (loading) return "Cutting the pieces…";
    if (!board) return "Open a picture to start";
    if (solved) return `Solved in ${format_time(elapsed)}`;
    if (edge_only) return "Edge pieces only";
    return counts.placed ? `${counts.placed} of ${total} in place` : "Drag pieces into the frame";
  });

  function report(title: string, reason?: unknown) {
    if (reason instanceof Error) console.error(`[Jigsaw] ${title}`, reason);
    notifications.notify(app_id, {
      type: NotificationType.ERROR,
      title,
      message: reason === undefined ? undefined : error_message(reason),
    });
  }

  function save() {
    if (!board || !source_path || !cuts) return;
    const entry: Saved = {
      path: source_path,
      pieces,
      seed,
      width: cuts.layout.width,
      height: cuts.layout.height,
      positions: positions_of(board),
      elapsed: clock.read(),
    };
    storage.set("game", entry);
  }

  function fit() {
    if (!board || !size.width) return;
    const area = bounds(board, tab_margin(board.layout));
    const next = fit_view(area.width, area.height, size.width, size.height, 12);
    view = { scale: next.scale, offset_x: next.offset_x - area.x * next.scale, offset_y: next.offset_y - area.y * next.scale };
  }

  function start(count: PieceCount, saved: Saved | null) {
    if (!picture) return;
    const layout = grid_for(count, picture.width, picture.height);
    pieces = count;
    seed = saved?.seed ?? random_seed();
    cuts = cut(layout, seed);
    const aspect = size.width && size.height ? size.width / size.height : 1.5;
    board = create_board(layout, saved && fits(saved, layout) ? saved.positions : scatter(layout, seed, aspect));
    lifted = null;
    solved = is_complete(board);
    clock.reset(saved ? saved.elapsed : 0);
    revision++;
    view = null;
    fit();
    save();
  }

  async function open(blob: Blob, name: string, path: string | null, saved: Saved | null = null) {
    loading = true;
    try {
      const next = await load_picture(blob);
      picture?.close();
      picture = next;
      source_path = path;
      source_name = name;
      start(saved?.pieces ?? fitting.filter((count) => count <= pieces).at(-1) ?? fitting[0], saved);
    } catch (reason) {
      report("Couldn't open the picture", reason);
    } finally {
      loading = false;
    }
  }

  async function open_path(target: string, saved: Saved | null = null) {
    try {
      const file = await files.get_file(target);
      if (!file) return report("File not found", target);
      await open(file, file.name, target, saved);
    } catch (reason) {
      report("Couldn't read the file", reason);
    }
  }

  async function confirm_restart(message: string): Promise<boolean> {
    if (!board || solved || (!clock.running && !clock.read())) return true;
    return win.confirm(message, { detail: "The pieces you joined are lost.", confirm_label: "Start over" });
  }

  async function pick() {
    const chosen = await win.pick_file({ accept: ["image/*"], title: "Open a picture" });
    if (chosen && (await confirm_restart("Open another picture?"))) await open_path(chosen);
  }

  async function take(list: File[]) {
    const file = list[0];
    if (file && (await confirm_restart("Open another picture?"))) await open(file, file.name, null);
  }

  const pick_device = async () => take(await pick_device_files({ accept: ["image/*"] }));

  async function set_pieces(next: PieceCount) {
    if (next === pieces) return;
    storage.set("pieces", next);
    if (!picture) {
      pieces = next;
      return;
    }
    if (await confirm_restart(`Start over with ${next} pieces?`)) start(next, null);
  }

  async function reshuffle() {
    if (await confirm_restart("Start over with a new cut?")) start(pieces, null);
  }

  const saved_game = storage.get("game", saved_schema);
  const initial_path = untrack(() => path_prop);
  if (initial_path) void open_path(initial_path, saved_game?.path === initial_path ? saved_game : null);
  else if (saved_game) void open_path(saved_game.path, saved_game);

  $effect(() => {
    if (!canvas) return;
    const target = canvas;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize[0];
      const pixels = entry.devicePixelContentBoxSize?.[0];
      const dpr = pixels && box.inlineSize ? pixels.inlineSize / box.inlineSize : window.devicePixelRatio;
      size = { width: box.inlineSize, height: box.blockSize, dpr };
    });
    observer.observe(target);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (size.width && board && !view) untrack(fit);
  });

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(settings.theme);
    if (!root) return;
    const probe = root;
    const frame = requestAnimationFrame(() => (palette = read_palette(probe)));
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!picture || !cuts || !palette) return;
    const next = render_pieces(picture, cuts, palette.edge);
    sprites = next;
    return () => next.forEach((sprite) => sprite.bitmap.close());
  });

  $effect(() => () => picture?.close());

  $effect(() => {
    revision;
    if (!canvas || !board || !picture || !palette || !view || !size.width || sprites.length !== total) return;
    const target = canvas;
    const scene = {
      board,
      sprites,
      picture,
      view,
      palette,
      width: size.width,
      height: size.height,
      dpr: size.dpr,
      ghost,
      hidden,
      lifted,
    };
    const frame = requestAnimationFrame(() => {
      const width = Math.round(scene.width * scene.dpr);
      const height = Math.round(scene.height * scene.dpr);
      if (target.width !== width) target.width = width;
      if (target.height !== height) target.height = height;
      const ctx = target.getContext("2d");
      if (ctx) draw(ctx, scene);
    });
    return () => cancelAnimationFrame(frame);
  });

  const pointers = new Map<number, Point>();
  let pinch: { view: View; mid: Point; distance: number } | null = null;
  let pan: { pointer: number; start: Point; view: View } | null = null;
  let drag: { pointer: number; piece: number; group: number[]; last: Point } | null = null;
  /** The touch already pinched: its remaining fingers neither drag nor pan until all lift. */
  let spent = false;

  function screen_point(event: { clientX: number; clientY: number }): Point {
    const box = canvas?.getBoundingClientRect();
    return box ? { x: event.clientX - box.left, y: event.clientY - box.top } : { x: 0, y: 0 };
  }

  function spread(): { mid: Point; distance: number } {
    const [a, b] = [...pointers.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function tolerance(current: View): number {
    if (!board) return 0;
    const side = Math.min(board.layout.piece_width, board.layout.piece_height);
    return Math.min(side * 0.35, Math.max(side * 0.2, 12 / current.scale));
  }

  function let_go() {
    if (!drag || !board || !view) return;
    const piece = drag.piece;
    drag = null;
    lifted = null;
    drop(board, piece, tolerance(view));
    if (is_complete(board)) {
      settle(board);
      solved = true;
      clock.pause();
    }
    revision++;
    save();
  }

  function on_pointerdown(event: PointerEvent) {
    if (!board || !view || solved || (event.button !== 0 && event.button !== 1)) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const screen = screen_point(event);
    pointers.set(event.pointerId, screen);
    if (pointers.size === 2 && event.pointerType !== "mouse") {
      let_go();
      pan = null;
      spent = true;
      pinch = { view, ...spread() };
      return;
    }
    if (pointers.size > 1 || spent) return;
    const world = to_image(view, screen.x, screen.y);
    const piece = event.button === 0 ? piece_at(board, sprites, hidden, world.x, world.y) : null;
    if (piece === null || is_placed(board, piece)) {
      pan = { pointer: event.pointerId, start: screen, view };
      return;
    }
    const group = members(board, piece);
    raise(board, group);
    lifted = new Set(group);
    drag = { pointer: event.pointerId, piece, group, last: world };
    if (!clock.running) clock.start();
    revision++;
  }

  function on_pointermove(event: PointerEvent) {
    if (!pointers.has(event.pointerId) || !view) return;
    const screen = screen_point(event);
    pointers.set(event.pointerId, screen);
    if (pinch) {
      if (pointers.size < 2) return;
      const { mid, distance } = spread();
      view = pinch_view(pinch.view, pinch.mid, pinch.distance, mid, distance);
    } else if (drag && drag.pointer === event.pointerId && board) {
      const world = to_image(view, screen.x, screen.y);
      move_group(board, drag.group, world.x - drag.last.x, world.y - drag.last.y);
      drag.last = world;
      revision++;
    } else if (pan && pan.pointer === event.pointerId) {
      view = {
        scale: pan.view.scale,
        offset_x: pan.view.offset_x + screen.x - pan.start.x,
        offset_y: pan.view.offset_y + screen.y - pan.start.y,
      };
    }
  }

  function on_lostpointercapture(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pinch && pointers.size < 2) pinch = null;
    if (drag?.pointer === event.pointerId) let_go();
    if (pan?.pointer === event.pointerId) pan = null;
    if (!pointers.size) spent = false;
  }

  function zoom_by(factor: number) {
    if (view) view = zoom_view(view, factor, size.width / 2, size.height / 2);
  }

  // Wheel listeners must be non-passive to stop the page from scrolling.
  function wheel(element: HTMLElement) {
    const on_wheel = (event: WheelEvent) => {
      if (!view) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const { x, y } = screen_point(event);
        view = zoom_view(view, Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0025)), x, y);
      } else {
        view = { scale: view.scale, offset_x: view.offset_x - event.deltaX, offset_y: view.offset_y - event.deltaY };
      }
    };
    element.addEventListener("wheel", on_wheel, { passive: false });
    return () => element.removeEventListener("wheel", on_wheel);
  }

  function on_paste(event: ClipboardEvent) {
    if (!win.is_focused) return;
    const target = event.target;
    if (target instanceof Node && target !== document.body && !root?.contains(target)) return;
    const list = image_files(event.clipboardData);
    if (!list.length) return;
    event.preventDefault();
    void take(list);
  }

  function on_dragover(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging_file = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!root?.contains(event.relatedTarget as Node | null)) dragging_file = false;
  }

  function on_drop(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging_file = false;
    void take(image_files(event.dataTransfer));
  }
</script>

<svelte:document onpaste={on_paste} />

<div
  bind:this={root}
  role="presentation"
  class={cn("grid h-full grid-rows-[auto_1fr_auto]", dragging_file && "ring-2 ring-cottontail ring-inset")}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    <Button size="sm" variant="quiet" class="hidden @md:inline-flex" onclick={pick}>
      <ImageSquareIcon weight="bold" /> Open picture…
    </Button>
    <IconButton size="sm" label="Open picture…" class="@md:hidden" onclick={pick}>
      <ImageSquareIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="From device…" onclick={pick_device}>
      <DevicesIcon weight="bold" />
    </IconButton>
    <Select class="w-32" size="sm" aria-label="Pieces" options={count_options} bind:value={() => String(pieces), (value) => set_pieces(pieces_schema.parse(Number(value)))} />
    <div class="flex-1"></div>
    <IconButton size="sm" label="Edge pieces only" pressed={edge_only} disabled={!board || solved} onclick={() => (edge_only = !edge_only)}>
      <FrameCornersIcon weight={edge_only ? "fill" : "bold"} />
    </IconButton>
    <IconButton size="sm" label="Preview in the frame" pressed={ghost} disabled={!board} onclick={() => (ghost = !ghost)}>
      <EyeIcon weight={ghost ? "fill" : "bold"} />
    </IconButton>
    <IconButton size="sm" label="Zoom out" class="hidden @lg:inline-flex" disabled={!view} onclick={() => zoom_by(1 / ZOOM_STEP)}>
      <ZoomOutIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Zoom in" class="hidden @lg:inline-flex" disabled={!view} onclick={() => zoom_by(ZOOM_STEP)}>
      <ZoomInIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Fit everything" disabled={!board} onclick={fit}>
      <FitIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="New cut" disabled={!picture} onclick={reshuffle}>
      <ShuffleIcon weight="bold" />
    </IconButton>
  </Toolbar>

  <div class="relative min-h-0 bg-background-darker">
    <canvas
      bind:this={canvas}
      class={cn("absolute inset-0 size-full touch-none select-none", !board && "invisible")}
      aria-label="Jigsaw, {total} pieces. Drag pieces to join them; drag the table to pan, pinch or Ctrl+scroll to zoom"
      onpointerdown={on_pointerdown}
      onpointermove={on_pointermove}
      onlostpointercapture={on_lostpointercapture}
      {@attach wheel}
    ></canvas>

    {#if loading}
      <div class="absolute inset-0 grid place-items-center"><Spinner /></div>
    {:else if !board}
      <EmptyState
        icon={PuzzlePieceIcon}
        title="No picture yet"
        description="Open a picture to cut it into a puzzle. You can also paste or drop one here."
      >
        {#snippet actions()}
          <Button variant="primary" onclick={pick}><ImageSquareIcon weight="bold" /> Open picture…</Button>
          <Button onclick={pick_device}><DevicesIcon weight="bold" /> From device…</Button>
        {/snippet}
      </EmptyState>
    {:else if solved}
      <BoardOverlay title="Solved" detail="{total} pieces · {format_time(elapsed)}">
        <Button size="sm" variant="quiet" onclick={pick}>Another picture</Button>
        <Button size="sm" variant="primary" onclick={reshuffle}>New cut</Button>
      </BoardOverlay>
    {/if}
  </div>

  <StatusBar>
    <span class="shrink-0 font-mono tabular-nums">{format_time(elapsed)}</span>
    {#if board}
      <span class="hidden shrink-0 font-mono tabular-nums @sm:inline">{counts.groups} {counts.groups === 1 ? "group" : "groups"}</span>
    {/if}
    <span class="min-w-0 truncate" aria-live="polite">{status}</span>
    {#if source_name}<span class="hidden min-w-0 truncate @md:inline">{source_name}</span>{/if}
    <span class="hidden @2xl:inline pointer-coarse:hidden">Ctrl+scroll zooms · drag the table to pan</span>
  </StatusBar>
</div>

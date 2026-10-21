<script lang="ts">
  import kernel, { ShortcutCategory, type FilesService, type ShortcutsService } from "$lib/core/api";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { Badge, Button, IconButton, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    ArrowLeft as ArrowLeftIcon,
    ArrowUUpLeft as UndoIcon,
    ArrowUUpRight as RedoIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    Image as ImageIcon,
    Play as PlayIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import Board from "./board.svelte";
  import { compact, NONOGRAM_EXTENSION, parse_nonogram, serialize_nonogram, type Drawing } from "./file";
  import { Mark, Mode } from "./game";
  import { analyze_off_thread, type AnalysisJob } from "./analysis";
  import { BW_PALETTE, differences, from_solution, INKS, MAX_COLORS, Verdict } from "./puzzle";
  import { resize, sides_for, to_editor } from "./drawing";
  import Swatches from "./swatches.svelte";
  import FromImage from "./from-image.svelte";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { report_error } from "$kit/utils/report-error";

  interface Props {
    drawing: Drawing;
    path: string | null;
    testing: boolean;
    on_test: (drawing: Drawing) => void;
    on_close: (saved: { path: string; drawing: Drawing } | null) => void;
  }

  let { drawing: initial, path: initial_path, testing, on_test, on_close }: Props = $props();

  const MODE_OPTIONS = [
    { value: Mode.BW, label: "B/W" },
    { value: Mode.COLOR, label: "Colour" },
  ];

  const { app_id, window_id, window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  const start = untrack(() => to_editor(initial));
  let path = $state<string | null>(untrack(() => initial_path));
  let title = $state(start.title);
  let width = $state(start.width);
  let height = $state(start.height);
  let cells = $state.raw<readonly number[]>(start.cells);
  let mode = $state<Mode>(start.cells.some((cell) => cell > 1) ? Mode.COLOR : Mode.BW);
  let tool = $state<Mark>(Mark.FILLED);
  let undo_stack = $state.raw<(readonly number[])[]>([]);
  let redo_stack = $state.raw<(readonly number[])[]>([]);
  let importing = $state(false);

  const current = $derived<Drawing>({ ...(title ? { title } : {}), width, height, palette: INKS, cells });
  const text = $derived(serialize_nonogram(current));
  let saved_text = $state(serialize_nonogram(start));
  const dirty = $derived(text !== saved_text);
  const name = $derived(path ? base_name(path) : "Untitled puzzle");
  const clues = $derived(from_solution(0, width, height, INKS, cells));
  const used = $derived(new Set(cells.filter((cell) => cell > 0)));
  const empty = $derived(used.size === 0);
  const palette = $derived(mode === Mode.COLOR ? INKS : BW_PALETTE);

  interface Check {
    verdict: Verdict | null;
    flagged: ReadonlySet<number>;
    for_text: string;
  }
  let check = $state.raw<Check>({ verdict: null, flagged: new Set(), for_text: "" });
  const checking = $derived(!empty && check.for_text !== text);

  $effect(() => {
    if (empty) return;
    const { width, height, palette, cells } = compact(current);
    const for_text = text;
    let job: AnalysisJob | null = null;
    const timer = setTimeout(() => {
      job = analyze_off_thread({ width, height, palette, cells, budget: 4000, time_ms: 400 });
      job.result.then(
        (result) => {
          const flagged = result.verdict === Verdict.MULTIPLE ? new Set(differences(result.solutions[0], result.solutions[1])) : new Set<number>();
          check = { verdict: result.verdict, flagged, for_text };
        },
        (error) => console.warn("[Nonogram] Couldn't check the puzzle:", error)
      );
    }, 180);
    return () => {
      clearTimeout(timer);
      job?.cancel();
    };
  });

  const VERDICTS: Record<Verdict, { tone: "success" | "warning" | "error"; badge: string; detail: string }> = {
    [Verdict.LOGIC]: { tone: "success", badge: "Unique", detail: "Solvable by logic alone" },
    [Verdict.UNIQUE]: { tone: "warning", badge: "Unique", detail: "One answer, but reaching it needs a guess" },
    [Verdict.MULTIPLE]: { tone: "error", badge: "Multiple solutions", detail: "The marked cells could go either way" },
    [Verdict.NONE]: { tone: "error", badge: "No solution", detail: "No picture fits these clues" },
    [Verdict.UNKNOWN]: { tone: "warning", badge: "Unchecked", detail: "Too complex to check quickly" },
  };
  const shown = $derived(!empty && !checking && check.verdict ? VERDICTS[check.verdict] : null);

  $effect(() => win.set_title(name));
  $effect(() => win.set_dirty(dirty, { save }));
  $effect(() => () => win.set_dirty(false));

  $effect(() => {
    if (testing || importing) return;
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `nonogram.editor.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", undo),
      scoped("redo", "mod+shift+z", "Redo", redo),
      scoped("redo-alt", "mod+y", "Redo", redo),
      scoped("save", "mod+s", "Save puzzle", save),
      scoped("save-as", "mod+shift+s", "Save puzzle as…", save_as),
      scoped("open", "mod+o", "Open puzzle…", open),
      scoped("erase", "e", "Eraser", () => (tool = Mark.EMPTY)),
    ];
    palette.forEach((_, index) => {
      disposers.push(scoped(`color-${index + 1}`, String(index + 1), `Colour ${index + 1}`, () => can_use(index + 1) && (tool = index + 1)));
    });
    return () => disposers.forEach((dispose) => dispose());
  });

  $effect(() => {
    if (tool > palette.length) tool = Mark.FILLED;
  });

  function can_use(color: number): boolean {
    return used.has(color) || used.size < MAX_COLORS;
  }

  function pick(secondary: boolean): Mark {
    return secondary ? Mark.EMPTY : tool;
  }

  function commit(next: readonly number[], base: readonly number[] = cells) {
    if (next.every((cell, index) => cell === base[index])) {
      cells = next;
      return;
    }
    undo_stack = [...undo_stack, base].slice(-200);
    redo_stack = [];
    cells = next;
  }

  function undo() {
    if (!undo_stack.length) return;
    redo_stack = [...redo_stack, cells];
    cells = undo_stack[undo_stack.length - 1];
    undo_stack = undo_stack.slice(0, -1);
  }

  function redo() {
    if (!redo_stack.length) return;
    undo_stack = [...undo_stack, cells];
    cells = redo_stack[redo_stack.length - 1];
    redo_stack = redo_stack.slice(0, -1);
  }

  function set_size(next_width: number, next_height: number) {
    if (next_width === width && next_height === height) return;
    cells = resize(cells, width, height, next_width, next_height);
    width = next_width;
    height = next_height;
    undo_stack = [];
    redo_stack = [];
  }

  async function set_mode(next: Mode) {
    if (next === mode) return;
    if (next === Mode.BW && [...used].some((color) => color > 1)) {
      const confirmed = await win.confirm("Make it black and white?", {
        detail: "Every colour becomes ink. Undo brings the colours back.",
        confirm_label: "Black and white",
      });
      if (!confirmed) return;
      commit(cells.map((cell) => (cell > 0 ? 1 : 0)));
    }
    mode = next;
  }

  function clear() {
    commit(cells.map(() => 0));
  }

  async function discard_ok(): Promise<boolean> {
    return !dirty || confirm_discard(win, name);
  }

  function load(drawing: Drawing, at: string | null): Drawing {
    const next = to_editor(drawing);
    path = at;
    title = next.title;
    width = next.width;
    height = next.height;
    cells = next.cells;
    mode = next.cells.some((cell) => cell > 1) ? Mode.COLOR : Mode.BW;
    undo_stack = [];
    redo_stack = [];
    return next;
  }

  async function use_image(drawing: Drawing) {
    if (!(await discard_ok())) return;
    load(drawing, null);
    importing = false;
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({ accept: [NONOGRAM_EXTENSION], start_path: path ? parent_path(path) : undefined, title: "Open puzzle" });
    if (!chosen) return;
    try {
      const file = await files.get_file(chosen);
      if (!file) throw new Error(`Not found: ${chosen}`);
      const parsed = parse_nonogram(await file.text());
      if (!parsed.ok) throw new Error(parsed.error);
      saved_text = serialize_nonogram(load(parsed.drawing, chosen));
    } catch (reason) {
      report_error(app_id, "Couldn't open the puzzle", reason);
    }
  }

  async function write(target: string): Promise<boolean> {
    try {
      const directory = await files.get_directory(parent_path(target));
      if (!directory) throw new Error(`Folder not found: ${parent_path(target)}`);
      const content = text;
      await files.create_file(directory, base_name(target), { content, overwrite: true });
      saved_text = content;
      path = target;
      return true;
    } catch (reason) {
      report_error(app_id, "Couldn't save the puzzle", reason);
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const chosen = await win.pick_save({
      name: path ? name : `Puzzle${NONOGRAM_EXTENSION}`,
      accept: [NONOGRAM_EXTENSION],
      start_path: path ? parent_path(path) : "/home",
      title: "Save puzzle",
    });
    if (!chosen) return false;
    return write(chosen.endsWith(NONOGRAM_EXTENSION) ? chosen : `${chosen}${NONOGRAM_EXTENSION}`);
  }

  function save(): Promise<boolean> {
    return path ? write(path) : save_as();
  }

  export async function close() {
    if (importing) {
      importing = false;
      return;
    }
    if (!(await discard_ok())) return;
    on_close(path && !dirty ? { path, drawing: compact(current) } : null);
  }

  function test() {
    if (!empty) on_test(compact(current));
  }
</script>

{#snippet shape()}
  <Segmented size="sm" label="Colours" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
  <div class="flex items-center gap-1">
    <Select class="w-16" size="sm" aria-label="Width" options={sides_for(width)} bind:value={() => String(width), (next) => set_size(Number(next), height)} />
    <span class="text-ui text-foreground/65" aria-hidden="true">×</span>
    <Select class="w-16" size="sm" aria-label="Height" options={sides_for(height)} bind:value={() => String(height), (next) => set_size(width, Number(next))} />
  </div>
{/snippet}

{#snippet tools(control: "sm" | "md")}
  <Swatches size={control} {palette} extra="erase" bind:value={tool} disabled={(color) => !can_use(color)} />
  <div class="flex items-center gap-1">
    <IconButton size={control} label="Undo (Ctrl+Z)" disabled={!undo_stack.length} onclick={undo}><UndoIcon weight="bold" /></IconButton>
    <IconButton size={control} label="Redo (Ctrl+Shift+Z)" disabled={!redo_stack.length} onclick={redo}><RedoIcon weight="bold" /></IconButton>
    <IconButton size={control} label="Clear" disabled={empty} onclick={clear}><TrashIcon weight="bold" /></IconButton>
  </div>
{/snippet}

{#if importing}
  <FromImage on_cancel={() => (importing = false)} on_use={use_image} />
{:else}
  <div class="grid h-full grid-rows-[auto_auto_1fr_auto_auto] @5xl:grid-rows-[auto_auto_1fr_auto]">
    <Toolbar>
      <IconButton size="sm" label="Back to playing" onclick={close}><ArrowLeftIcon weight="bold" /></IconButton>
      <div class="hidden items-center gap-2 @2xl:flex">{@render shape()}</div>
      <div class="hidden items-center gap-2 @5xl:flex">{@render tools("sm")}</div>
      <div class="flex-1"></div>
      <IconButton size="sm" label="From an image…" onclick={() => (importing = true)}><ImageIcon weight="bold" /></IconButton>
      <IconButton size="sm" label="Open a puzzle (Ctrl+O)" onclick={open}><FolderOpenIcon weight="bold" /></IconButton>
      <IconButton size="sm" label="Save (Ctrl+S)" onclick={save}><FloppyDiskIcon weight={dirty ? "fill" : "bold"} /></IconButton>
      <Button size="sm" variant="primary" disabled={empty} onclick={test}>
        <PlayIcon weight="fill" class="size-3.5" />
        <span class="hidden @md:inline">Play-test</span>
        <span class="@md:hidden">Test</span>
      </Button>
    </Toolbar>

    <div class="flex min-h-9 items-center justify-center gap-2 border-b border-foreground/8 px-3 py-1.5 text-center" aria-live="polite">
      {#if empty}
        <span class="text-ui text-foreground/65">Draw a picture; its clues build around it as you go.</span>
      {:else if checking}
        <Badge>Checking…</Badge>
      {:else if shown}
        <Badge tone={shown.tone}>{shown.badge}</Badge>
        <span class="truncate text-ui text-foreground/80">{shown.detail}</span>
      {/if}
    </div>

    <div class="flex min-h-0 overflow-auto p-2 [container-type:size] @md:p-4">
      <Board
        {width}
        {height}
        rows={clues.rows}
        cols={clues.cols}
        palette={INKS}
        colored={mode === Mode.COLOR}
        marks={cells}
        label="Drawing, {width} by {height}. Arrows move, Space paints, X erases, Shift with arrows paints a line"
        flagged={shown && check.verdict === Verdict.MULTIPLE ? check.flagged : undefined}
        overwrite
        {pick}
        on_change={(next) => (cells = next)}
        on_commit={(next, base) => commit(next, base)}
      />
    </div>

    <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-foreground/8 px-3 py-2 @5xl:hidden">
      <div class="flex items-center gap-2 @2xl:hidden">{@render shape()}</div>
      {@render tools("md")}
    </div>

    <StatusBar class="hidden @md:flex">
      <span class="shrink-0 font-mono tabular-nums">{width}×{height}</span>
      <span class={cn("truncate", !path && "text-foreground/65")}>{path ?? "Not saved yet"}{dirty ? " · edited" : ""}</span>
      <span class="hidden shrink-0 @2xl:inline">{mode === Mode.COLOR ? `${used.size}/${MAX_COLORS} colours` : "Black and white"}</span>
      <span class="hidden @4xl:inline">Right-click erases · drag to paint a line</span>
    </StatusBar>
  </div>
{/if}

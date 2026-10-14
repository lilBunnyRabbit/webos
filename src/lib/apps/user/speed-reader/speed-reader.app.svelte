<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { Button, EmptyState, IconButton, Input, Separator, Slider, Spinner, Switch, Textarea, Toolbar } from "$lib/core/components/ui";
  import {
    BookOpenText as BookOpenTextIcon,
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    ClipboardText as ClipboardTextIcon,
    Devices as DevicesIcon,
    FolderOpen as FolderOpenIcon,
    Minus as MinusIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    Plus as PlusIcon,
    SkipBack as SkipBackIcon,
    SkipForward as SkipForwardIcon,
    SlidersHorizontal as SlidersHorizontalIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { onDestroy, tick, untrack } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { fade } from "svelte/transition";
  import manifest from "./index";
  import {
    DEFAULT_SETTINGS,
    MAX_GHOST_WORDS,
    clamp_int,
    find_position,
    pause_settings,
    positions_schema,
    remember_position,
    settings_schema,
  } from "./storage";
  import {
    MAX_PAUSE_MS,
    MAX_WPM,
    MIN_WPM,
    build_timeline,
    elapsed_at,
    elapsed_for_index,
    format_duration,
    position_at,
  } from "./timeline";
  import { tokenize, type ReaderToken } from "./tokens";
  import { parent_path } from "$lib/core/api/services/files/path";
  import { error_message } from "$lib/core/utils";

  interface Source {
    path: string | null;
    name: string;
    text: string;
    tokens: ReaderToken[];
  }

  const WPM_STEP = 50;
  const ENTRANCE_RATIO = 0.3;
  const GHOST_OPACITY = [40, 25, 15, 10, 6];
  // A longer gap is a stalled tab or a debugger pause, not reading time; catching it up would skip whole sentences.
  const MAX_FRAME_MS = 250;

  const { path: initial_path }: { path?: string } = $props();
  const { window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  const settings = storage.persisted("settings", DEFAULT_SETTINGS, settings_schema);

  let root = $state<HTMLDivElement>();
  let source = $state.raw<Source | null>(null);
  let draft = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let show_settings = $state(false);

  let index = $state(0);
  let progress = 0;
  let playing = $state(false);

  const tokens = $derived(source?.tokens ?? []);
  const timeline = $derived(build_timeline(tokens, settings.value.wpm, pause_settings(settings.value)));
  const current = $derived(tokens[index]);
  const before = $derived(tokens.slice(Math.max(0, index - settings.value.ghost_words), index));
  const after = $derived(tokens.slice(index + 1, index + 1 + settings.value.ghost_words));
  const entrance_ms = $derived(prefersReducedMotion.current ? 0 : (timeline.segments[0]?.base_ms ?? 0) * ENTRANCE_RATIO);

  // The rAF callback reads `timeline` and `index` untracked, so a rebuilt timeline (speed or pause change) continues
  // from the same fraction of the current word instead of restarting the loop.
  $effect(() => {
    if (!playing) return;
    let last: number | null = null;

    let frame = requestAnimationFrame(function step(now) {
      const delta = last === null ? 0 : Math.min(now - last, MAX_FRAME_MS);
      last = now;
      const elapsed = elapsed_at(timeline, { index, progress }) + delta;
      if (elapsed >= timeline.total_ms) {
        index = timeline.segments.length - 1;
        progress = 0;
        pause();
        return;
      }
      ({ index, progress } = position_at(timeline, elapsed));
      frame = requestAnimationFrame(step);
    });

    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!win.is_visible) untrack(pause);
  });

  onDestroy(save_position);

  function save_position() {
    if (!source?.path) return;
    const stored = storage.get("positions", positions_schema) ?? [];
    storage.set("positions", remember_position(stored, source.path, index));
  }

  function play() {
    if (!tokens.length) return;
    if (index >= tokens.length - 1) seek(0);
    playing = true;
  }

  function pause() {
    if (!playing) return;
    playing = false;
    save_position();
  }

  function toggle() {
    if (playing) pause();
    else play();
  }

  function seek(target: number) {
    if (!tokens.length) return;
    index = clamp_int(target, 0, tokens.length - 1);
    progress = 0;
    if (!playing) save_position();
  }

  function step_to(target: number) {
    pause();
    seek(target);
  }

  // Colour, not opacity, so the truncation ellipsis fades with the farthest word instead of showing at full strength.
  function ghost_color(distance: number): string {
    return `color-mix(in oklch, var(--foreground) ${GHOST_OPACITY[distance - 1] ?? 0}%, transparent)`;
  }

  function set_wpm(value: number) {
    settings.value.wpm = clamp_int(value, MIN_WPM, MAX_WPM);
  }

  function number_setting(apply: (value: number) => void, read: () => number) {
    return (event: Event & { currentTarget: HTMLInputElement }) => {
      apply(event.currentTarget.valueAsNumber);
      event.currentTarget.value = String(read());
    };
  }

  function toggle_settings() {
    show_settings = !show_settings;
    if (show_settings) pause();
  }

  async function show(next: Source) {
    playing = false;
    source = next;
    const stored = next.path ? find_position(storage.get("positions", positions_schema) ?? [], next.path) : null;
    index = clamp_int(stored ?? 0, 0, Math.max(0, next.tokens.length - 1));
    progress = 0;
    await tick();
    root?.focus({ preventScroll: true });
  }

  let request = 0;

  async function open_file(load: () => Promise<File>, path: string | null) {
    const id = ++request;
    pause();
    loading = true;
    error = null;
    try {
      const file = await load();
      const text = await file.text();
      if (id === request) await show({ path, name: file.name, text, tokens: tokenize(text) });
    } catch (reason) {
      if (id === request) error = error_message(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  function open_path(target: string) {
    return open_file(async () => {
      const file = await files.get_file(target);
      if (!file) throw new Error(`File not found: ${target}`);
      return file;
    }, target);
  }

  const initial = untrack(() => initial_path);
  if (initial) open_path(initial);

  async function pick() {
    const start_path = source?.path ? parent_path(source.path) : undefined;
    const chosen = await win.pick_file({ accept: manifest.tools, start_path, title: "Open in Speed Reader" });
    if (chosen) open_path(chosen);
  }

  async function pick_device() {
    const [file] = await pick_device_files({ accept: manifest.tools });
    if (file) open_file(async () => file, null);
  }

  function read_draft() {
    if (!draft.trim()) return;
    error = null;
    show({ path: null, name: "Pasted text", text: draft, tokens: tokenize(draft) });
  }

  function edit_text() {
    pause();
    save_position();
    request++;
    loading = false;
    error = null;
    draft = source && !source.path ? source.text : "";
    source = null;
  }

  function on_keydown(event: KeyboardEvent) {
    if (!source || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if (target instanceof HTMLInputElement && (target.type !== "range" || event.key !== " ")) return;
    if (target instanceof HTMLButtonElement && (event.key === " " || event.key === "Enter")) return;

    const actions: Record<string, () => void> = {
      " ": toggle,
      ArrowLeft: () => step_to(index - (event.shiftKey ? 10 : 1)),
      ArrowRight: () => step_to(index + (event.shiftKey ? 10 : 1)),
      Home: () => step_to(0),
      End: () => step_to(tokens.length - 1),
      ArrowUp: () => set_wpm(settings.value.wpm + WPM_STEP),
      ArrowDown: () => set_wpm(settings.value.wpm - WPM_STEP),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }
</script>

<div bind:this={root} role="presentation" tabindex="-1" class="h-full outline-none" onkeydown={on_keydown}>
  {#if loading}
    <div class="grid h-full place-items-center"><Spinner label="Reading file" /></div>
  {:else if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the file" description={error}>
      {#snippet actions()}
        <Button onclick={edit_text}><ClipboardTextIcon weight="bold" /> Paste text</Button>
        <Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button>
        <Button onclick={pick_device}><DevicesIcon weight="bold" /> From device…</Button>
      {/snippet}
    </EmptyState>
  {:else if !source}
    <div class="grid h-full grid-rows-[auto_1fr]">
      <Toolbar>
        <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
        <IconButton label="Open from device…" size="sm" onclick={pick_device}><DevicesIcon weight="bold" /></IconButton>
        <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">Paste text</span>
        <Button variant="primary" size="sm" disabled={!draft.trim()} onclick={read_draft}><PlayIcon weight="fill" /> Read</Button>
      </Toolbar>
      <div class="grid min-h-0 p-3">
        <Textarea
          bind:value={draft}
          aria-label="Text to read"
          placeholder="Paste or type the text you want to read, or open a .txt or .md file."
          class="h-full min-h-0 resize-none leading-6 pointer-coarse:h-full"
          onkeydown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              read_draft();
            }
          }}
        />
      </div>
    </div>
  {:else if !tokens.length}
    <EmptyState icon={BookOpenTextIcon} title="Nothing to read" description="{source.name} has no words in it.">
      {#snippet actions()}
        <Button onclick={edit_text}><ClipboardTextIcon weight="bold" /> Paste text</Button>
        <Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button>
        <Button onclick={pick_device}><DevicesIcon weight="bold" /> From device…</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="grid h-full grid-rows-[auto_auto_1fr_auto]">
      <Toolbar>
        <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
        <IconButton label="Open from device…" size="sm" onclick={pick_device}><DevicesIcon weight="bold" /></IconButton>
        <IconButton label={source.path ? "Paste text" : "Edit text"} size="sm" onclick={edit_text}><ClipboardTextIcon weight="bold" /></IconButton>
        <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium" title={source.path ?? undefined}>{source.name}</span>

        <div class="flex items-center gap-1">
          <IconButton label="Slower (↓)" size="sm" disabled={settings.value.wpm <= MIN_WPM} onclick={() => set_wpm(settings.value.wpm - WPM_STEP)}>
            <MinusIcon weight="bold" />
          </IconButton>
          <Input
            type="number"
            size="sm"
            aria-label="Words per minute"
            min={MIN_WPM}
            max={MAX_WPM}
            step={WPM_STEP}
            value={settings.value.wpm}
            onchange={number_setting(set_wpm, () => settings.value.wpm)}
            class="w-16 text-center font-mono tabular-nums"
          />
          <IconButton label="Faster (↑)" size="sm" disabled={settings.value.wpm >= MAX_WPM} onclick={() => set_wpm(settings.value.wpm + WPM_STEP)}>
            <PlusIcon weight="bold" />
          </IconButton>
          <span class="hidden font-mono text-2xs text-foreground/80 @sm:inline">wpm</span>
        </div>
        <Separator vertical />
        <IconButton
          label="Reader settings"
          size="sm"
          pressed={show_settings}
          onclick={toggle_settings}
        >
          <SlidersHorizontalIcon weight="bold" />
        </IconButton>
      </Toolbar>

      {#if show_settings}
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-foreground/8 bg-background-light px-3 py-2 text-ui text-foreground/80">
          <label class="flex items-center gap-2" title="Words shown faded on each side of the current one">
            Ghost words
            <Input
              type="number"
              size="sm"
              min={0}
              max={MAX_GHOST_WORDS}
              value={settings.value.ghost_words}
              onchange={number_setting((value) => (settings.value.ghost_words = clamp_int(value, 0, MAX_GHOST_WORDS)), () => settings.value.ghost_words)}
              class="w-14 font-mono tabular-nums"
            />
          </label>
          <label class="flex items-center gap-2" title="Hold the word before punctuation a little longer">
            <Switch bind:checked={settings.value.pauses} />
            Pauses
          </label>
          <label class="flex items-center gap-2" title="Extra time on the last word of a sentence. Commas, dashes and ellipses have their own">
            Sentence pause
            <Input
              type="number"
              size="sm"
              min={0}
              max={MAX_PAUSE_MS}
              step={100}
              disabled={!settings.value.pauses}
              value={settings.value.sentence_pause_ms}
              onchange={number_setting(
                (value) => (settings.value.sentence_pause_ms = clamp_int(value, 0, MAX_PAUSE_MS)),
                () => settings.value.sentence_pause_ms
              )}
              class="w-18 font-mono tabular-nums"
            />
            <span class="font-mono text-2xs">ms</span>
          </label>
        </div>
      {:else}
        <div></div>
      {/if}

      <button
        type="button"
        class="stage grid min-h-0 cursor-pointer bg-background text-foreground touch-manipulation place-items-center overflow-hidden px-4 outline-none select-none"
        aria-label={playing ? "Pause" : "Play"}
        onclick={toggle}
      >
        <div class="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-4 font-mono">
          <div class="ghost truncate text-right" dir="rtl" style:color={ghost_color(settings.value.ghost_words)}>
            <span dir="ltr">
              {#each before as token, offset}<span style:color={ghost_color(before.length - offset)}>{offset ? " " : ""}{token.text}</span>{/each}
            </span>
          </div>
          <div class="grid">
            {#key index}
              <span class="word col-start-1 row-start-1 text-center whitespace-pre" style:--chars={Array.from(current?.text ?? "").length} in:fade={{ duration: entrance_ms }}>{current?.text}</span>
            {/key}
          </div>
          <div class="ghost truncate text-left" style:color={ghost_color(settings.value.ghost_words)}>
            {#each after as token, offset}<span style:color={ghost_color(offset + 1)}>{offset ? " " : ""}{token.text}</span>{/each}
          </div>
        </div>
      </button>

      <div class="flex flex-col gap-2 border-t border-foreground/8 bg-background-light px-3 pt-2 pb-2.5">
        <div class="flex items-center justify-center gap-2">
          <IconButton label="Jump to start (Home)" onclick={() => step_to(0)}><SkipBackIcon weight="bold" /></IconButton>
          <IconButton label="Previous word (←)" onclick={() => step_to(index - 1)}><CaretLeftIcon weight="bold" /></IconButton>
          <IconButton label={playing ? "Pause (Space)" : "Play (Space)"} variant="primary" size="lg" class="rounded-full" onclick={toggle}>
            {#if playing}<PauseIcon weight="fill" />{:else}<PlayIcon weight="fill" />{/if}
          </IconButton>
          <IconButton label="Next word (→)" onclick={() => step_to(index + 1)}><CaretRightIcon weight="bold" /></IconButton>
          <IconButton label="Jump to end (End)" onclick={() => step_to(tokens.length - 1)}><SkipForwardIcon weight="bold" /></IconButton>
        </div>
        <Slider
          aria-label="Position"
          min={0}
          max={Math.max(0, tokens.length - 1)}
          step={1}
          value={index}
          size="sm"
          class="w-full"
          oninput={(event) => seek(event.currentTarget.valueAsNumber)}
        />
        <div class="flex items-center justify-between gap-3 font-mono text-2xs text-foreground/80 tabular-nums">
          <span>{format_duration(elapsed_for_index(timeline, index))} / {format_duration(timeline.total_ms)}</span>
          <span>{index + 1} / {tokens.length}</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .stage {
    container-type: inline-size;
  }

  .word {
    /* Hack's advance is 0.6em, so a word of n characters is about 0.6n em wide: shrink long ones to fit the stage. */
    font-size: min(clamp(1.75rem, 9cqi, 3rem), calc((100cqi - 2rem) / (var(--chars) * 0.62)));
    line-height: 1.2;
  }

  .ghost {
    font-size: clamp(0.875rem, 3.5cqi, 1.125rem);
  }
</style>

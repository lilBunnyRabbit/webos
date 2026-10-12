<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, EmptyState, IconButton, Input, Separator, Spinner, StatusBar, Toolbar, field } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    BookOpenText as BookOpenTextIcon,
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    ClipboardText as ClipboardTextIcon,
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
  import manifest from "./index";
  import {
    DEFAULT_SETTINGS,
    MAX_GHOST_WORDS,
    clamp_int,
    find_position,
    positions_schema,
    remember_position,
    settings_schema,
  } from "./storage";
  import { MAX_PAUSE_MS, MAX_WPM, MIN_WPM, build_timeline, elapsed_for_index, format_duration, index_for_elapsed } from "./timeline";
  import { split_at_orp, tokenize, type ReaderToken } from "./tokens";

  interface Source {
    path: string | null;
    name: string;
    text: string;
    tokens: ReaderToken[];
  }

  const WPM_STEP = 25;

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
  let playing = $state(false);
  let seek_count = $state(0);

  const tokens = $derived(source?.tokens ?? []);
  const timeline = $derived(build_timeline(tokens, settings.value.wpm, settings.value.pause_ms));
  const current = $derived(tokens[index]);
  const parts = $derived(current ? split_at_orp(current) : ["", "", ""]);
  const before = $derived(tokens.slice(Math.max(0, index - settings.value.ghost_words), index).map((token) => token.text));
  const after = $derived(tokens.slice(index + 1, index + 1 + settings.value.ghost_words).map((token) => token.text));
  const elapsed = $derived(elapsed_for_index(timeline, index));

  $effect(() => {
    if (!playing) return;
    void seek_count;
    const schedule = timeline;
    // Anchored to the wall clock, so late timers never add up to drift.
    const origin = performance.now() - elapsed_for_index(schedule, untrack(() => index));
    let timer: ReturnType<typeof setTimeout> | undefined;

    const step = () => {
      const now = performance.now() - origin;
      if (now >= schedule.total_ms) {
        index = schedule.starts.length - 1;
        pause();
        return;
      }
      index = index_for_elapsed(schedule, now);
      timer = setTimeout(step, (schedule.starts[index + 1] ?? schedule.total_ms) - now);
    };
    untrack(step);

    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (win.is_minimized) untrack(pause);
  });

  onDestroy(save_position);

  function save_position() {
    if (!source?.path) return;
    const stored = storage.get("positions", positions_schema) ?? [];
    storage.set("positions", remember_position(stored, source.path, index));
  }

  function play() {
    if (!tokens.length) return;
    if (index >= tokens.length - 1) index = 0;
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
    seek_count++;
    if (!playing) save_position();
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

  async function show(next: Source) {
    playing = false;
    source = next;
    const stored = next.path ? find_position(storage.get("positions", positions_schema) ?? [], next.path) : null;
    index = clamp_int(stored ?? 0, 0, Math.max(0, next.tokens.length - 1));
    await tick();
    root?.focus({ preventScroll: true });
  }

  let request = 0;

  async function open_path(target: string) {
    const id = ++request;
    pause();
    loading = true;
    error = null;
    try {
      const file = await files.get_file(target);
      if (!file) throw new Error(`File not found: ${target}`);
      const text = await file.text();
      if (id === request) await show({ path: target, name: file.name, text, tokens: tokenize(text) });
    } catch (reason) {
      if (id === request) error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  const initial = untrack(() => initial_path);
  if (initial) open_path(initial);

  async function pick() {
    const start_path = source?.path ? source.path.slice(0, source.path.lastIndexOf("/")) || "/" : undefined;
    const chosen = await win.pick_file({ accept: manifest.tools, start_path, title: "Open in Speed Reader" });
    if (chosen) open_path(chosen);
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

    const actions: Record<string, () => void> = {
      " ": toggle,
      ArrowLeft: () => seek(index - (event.shiftKey ? 10 : 1)),
      ArrowRight: () => seek(index + (event.shiftKey ? 10 : 1)),
      Home: () => seek(0),
      End: () => seek(tokens.length - 1),
      ArrowUp: () => set_wpm(settings.value.wpm + WPM_STEP),
      ArrowDown: () => set_wpm(settings.value.wpm - WPM_STEP),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  function on_visibility_change() {
    if (document.hidden) pause();
  }
</script>

<svelte:document onvisibilitychange={on_visibility_change} />

<div bind:this={root} role="presentation" tabindex="-1" class="h-full outline-none" onkeydown={on_keydown}>
  {#if loading}
    <div class="grid h-full place-items-center"><Spinner label="Reading file" /></div>
  {:else if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the file" description={error}>
      {#snippet actions()}
        <Button onclick={edit_text}><ClipboardTextIcon weight="bold" /> Paste text</Button>
        <Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button>
      {/snippet}
    </EmptyState>
  {:else if !source}
    <div class="grid h-full grid-rows-[auto_1fr]">
      <Toolbar>
        <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
        <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">Paste text</span>
        <Button variant="primary" size="sm" disabled={!draft.trim()} onclick={read_draft}><PlayIcon weight="fill" /> Read</Button>
      </Toolbar>
      <div class="grid min-h-0 p-3">
        <textarea
          bind:value={draft}
          aria-label="Text to read"
          placeholder="Paste or type the text you want to read, or open a .txt or .md file."
          class={field({ class: "h-full resize-none py-2 leading-6 pointer-coarse:h-full" })}
          onkeydown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              read_draft();
            }
          }}
        ></textarea>
      </div>
    </div>
  {:else if !tokens.length}
    <EmptyState icon={BookOpenTextIcon} title="Nothing to read" description="{source.name} has no words in it.">
      {#snippet actions()}
        <Button onclick={edit_text}><ClipboardTextIcon weight="bold" /> Paste text</Button>
        <Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="grid h-full grid-rows-[auto_auto_1fr_auto_auto]">
      <Toolbar>
        <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
        <IconButton label={source.path ? "Paste text" : "Edit text"} size="sm" onclick={edit_text}><ClipboardTextIcon weight="bold" /></IconButton>
        <span class="min-w-16 flex-1 truncate px-1 text-ui font-medium" title={source.path ?? undefined}>{source.name}</span>

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
          <span class="font-mono text-2xs text-foreground/65">wpm</span>
        </div>
        <Separator vertical />
        <IconButton
          label="Reader settings"
          size="sm"
          aria-pressed={show_settings}
          class={cn(show_settings && "bg-foreground/10 text-foreground")}
          onclick={() => (show_settings = !show_settings)}
        >
          <SlidersHorizontalIcon weight="bold" />
        </IconButton>
      </Toolbar>

      {#if show_settings}
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-foreground/8 bg-background-light px-3 py-2 text-ui text-foreground/80">
          <label class="flex items-center gap-2" title="Words shown faded on each side of the current one">
            Context words
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
          <label class="flex items-center gap-2" title="Extra time after a sentence. Commas and dashes get part of it, paragraphs more">
            Sentence pause
            <Input
              type="number"
              size="sm"
              min={0}
              max={MAX_PAUSE_MS}
              step={50}
              value={settings.value.pause_ms}
              onchange={number_setting((value) => (settings.value.pause_ms = clamp_int(value, 0, MAX_PAUSE_MS)), () => settings.value.pause_ms)}
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
        class="stage grid min-h-0 cursor-pointer place-items-center overflow-hidden px-3 outline-none"
        aria-label={playing ? "Pause" : "Play"}
        onclick={toggle}
      >
        <div class="reader grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-[auto_auto_auto] font-mono">
          <span class="col-start-2 row-start-1 h-3 w-0.5 justify-self-center bg-foreground/25"></span>
          <span class="col-span-3 col-start-1 row-start-2 h-px self-start bg-foreground/12" aria-hidden="true"></span>
          <div class="col-start-1 row-start-2 self-baseline flex items-baseline justify-end overflow-hidden py-5 whitespace-pre">
            {#if before.length}<span class="ghost text-foreground/35">{before.join(" ")} </span>{/if}<span>{parts[0]}</span>
          </div>
          <span class="col-start-2 row-start-2 self-baseline py-5 whitespace-pre text-primary">{parts[1]}</span>
          <div class="col-start-3 row-start-2 self-baseline flex items-baseline overflow-hidden py-5 whitespace-pre">
            <span>{parts[2]}</span>{#if after.length}<span class="ghost text-foreground/35"> {after.join(" ")}</span>{/if}
          </div>
          <span class="col-span-3 col-start-1 row-start-2 h-px self-end bg-foreground/12" aria-hidden="true"></span>
          <span class="col-start-2 row-start-3 h-3 w-0.5 justify-self-center bg-foreground/25"></span>
        </div>
      </button>

      <div class="flex flex-col gap-2 border-t border-foreground/8 bg-background-light px-3 py-2">
        <input
          type="range"
          aria-label="Position"
          min={0}
          max={Math.max(0, tokens.length - 1)}
          step={1}
          value={index}
          class="w-full accent-primary"
          oninput={(event) => seek(event.currentTarget.valueAsNumber)}
        />
        <div class="flex items-center justify-between font-mono text-2xs text-foreground/80 tabular-nums">
          <span>{format_duration(elapsed)}</span>
          <span>−{format_duration(timeline.total_ms - elapsed)}</span>
        </div>
        <div class="flex items-center justify-center gap-1.5">
          <IconButton label="Jump to start (Home)" onclick={() => seek(0)}><SkipBackIcon weight="bold" /></IconButton>
          <IconButton label="Previous word (←)" onclick={() => seek(index - 1)}><CaretLeftIcon weight="bold" /></IconButton>
          <IconButton label={playing ? "Pause (Space)" : "Play (Space)"} variant={playing ? "secondary" : "primary"} onclick={toggle}>
            {#if playing}<PauseIcon weight="fill" />{:else}<PlayIcon weight="fill" />{/if}
          </IconButton>
          <IconButton label="Next word (→)" onclick={() => seek(index + 1)}><CaretRightIcon weight="bold" /></IconButton>
          <IconButton label="Jump to end (End)" onclick={() => seek(tokens.length - 1)}><SkipForwardIcon weight="bold" /></IconButton>
        </div>
      </div>

      <StatusBar>
        <span>Word {index + 1} / {tokens.length}</span>
        <span class="ml-auto">{settings.value.wpm} wpm</span>
        <span class="hidden @sm:inline">{format_duration(timeline.total_ms)} total</span>
      </StatusBar>
    </div>
  {/if}
</div>

<style>
  .stage {
    background: var(--background-darker);
    container-type: inline-size;
  }

  .reader {
    font-size: clamp(1.5rem, 8cqi, 3.75rem);
    line-height: 1.2;
  }

  .ghost {
    font-size: 0.4em;
  }
</style>

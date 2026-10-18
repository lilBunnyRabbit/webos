<script lang="ts">
  import { track_play } from "$kit/games";
  import { RouteKind, route_url } from "$lib/core/api/services/router/route";
  import { Button, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { day_key } from "$lib/core/utils/date";
  import { random_seed } from "$lib/core/utils/random";
  import { untrack } from "svelte";
  import { z, type ZodType } from "zod";
  import GradientSort from "./gradient-sort.svelte";
  import HexGuess from "./hex-guess.svelte";
  import { hex_state_schema } from "./hex";
  import { Level, Mode, MODE_NAMES, MODES } from "./modes";
  import OddOneOut from "./odd-one-out.svelte";
  import { odd_state_schema } from "./odd";
  import Recall from "./recall.svelte";
  import { recall_state_schema } from "./recall";
  import type { NextAction } from "./run";
  import { puzzle_number, resolve_seed, type Seed } from "./seed";
  import { challenge_props, share_head } from "./share";
  import { sort_state_schema } from "./sort";

  interface Props {
    mode?: Mode;
    seed?: Seed;
    daily?: string;
    level?: Level;
  }

  const Kind = { DAILY: "daily", PRACTICE: "practice" } as const;
  type Kind = (typeof Kind)[keyof typeof Kind];

  const MODE_OPTIONS = MODES.map((value) => ({ value, label: MODE_NAMES[value] }));
  const KIND_OPTIONS = [
    { value: Kind.DAILY, label: "Daily" },
    { value: Kind.PRACTICE, label: "Practice" },
  ];
  const LEVELED: readonly Mode[] = [Mode.RECALL, Mode.SORT];
  const LEVEL_LABELS: Partial<Record<Mode, Record<Level, string>>> = {
    [Mode.RECALL]: { [Level.EASY]: "Easy 5 s", [Level.HARD]: "Hard 2 s" },
    [Mode.SORT]: { [Level.EASY]: "Easy", [Level.HARD]: "Hard" },
  };
  const KEYS: Record<Mode, string> = {
    [Mode.RECALL]: "Arrows adjust a slider · Enter locks in",
    [Mode.ODD]: "Arrows move · Enter picks",
    [Mode.SORT]: "Arrows move · Enter picks, then swaps",
    [Mode.HEX]: "Type 0–9 A–F · Enter guesses · Backspace erases",
  };

  const props: Props = $props();
  const initial = untrack(() => ({ ...props }));

  const { app_id, window: win, storage } = get_app_context();
  const tracker = track_play(app_id, () => win.is_visible);
  // Fixed when the window opens: a daily started before midnight finishes as that day's.
  const today = day_key();

  const linked = initial.daily ?? initial.seed;
  // A link to today's puzzle is today's daily; any other seed is a challenge, played like practice and never counted.
  const challenge = linked !== undefined && linked !== today ? linked : null;

  let mode = $state<Mode>(initial.mode ?? storage.get("mode", z.enum(Mode)) ?? Mode.RECALL);
  let kind = $state<Kind>(challenge === null ? Kind.DAILY : Kind.PRACTICE);
  let practice = $state<{ seed: Seed; level: Level }>(
    challenge !== null ? { seed: challenge, level: initial.level ?? Level.EASY } : { seed: random_seed(), level: storage.get("level", z.enum(Level)) ?? Level.EASY }
  );

  const leveled = $derived(LEVELED.includes(mode));
  const level = $derived(kind === Kind.PRACTICE && leveled ? practice.level : Level.EASY);
  const seed = $derived<Seed>(kind === Kind.DAILY ? today : practice.seed);
  const run_key = $derived(`${mode}|${kind}|${seed}|${level}`);
  const level_options = $derived(
    Object.entries(LEVEL_LABELS[mode] ?? {}).map(([value, label]) => ({ value: value as Level, label }))
  );
  const where = $derived(
    kind === Kind.DAILY ? `Daily #${puzzle_number(today)} · ${today}` : typeof seed === "string" ? `Challenge · ${seed}` : "Practice"
  );

  const run = $derived.by(() => {
    const run_mode = mode;
    const counts = kind === Kind.DAILY;
    const next: NextAction = counts ? { label: "Practice", run: () => set_kind(Kind.PRACTICE) } : { label: "New puzzle", run: new_puzzle };
    return {
      seed: resolve_seed(run_mode, seed),
      level,
      daily: counts,
      head: share_head(run_mode, seed, level),
      link: route_url({ kind: RouteKind.SOLO, id: app_id, props: challenge_props(run_mode, seed, level) }),
      next,
      onsave: (state: unknown) => {
        if (counts) storage.set(`daily-${run_mode}`, { day: today, state });
      },
      onfinish: (ms: number, score?: number) => {
        if (counts) tracker.daily(today, ms, score, run_mode);
      },
    };
  });

  function saved<State>(schema: ZodType<State>): State | null {
    if (kind !== Kind.DAILY) return null;
    const entry = storage.get(`daily-${mode}`, z.object({ day: z.string(), state: schema }));
    return entry?.day === today ? entry.state : null;
  }

  function set_mode(next: Mode) {
    mode = next;
    storage.set("mode", next);
  }

  function set_kind(next: Kind) {
    kind = next;
  }

  function set_level(next: Level) {
    storage.set("level", next);
    practice = { seed: random_seed(), level: next };
  }

  function new_puzzle() {
    kind = Kind.PRACTICE;
    practice = { seed: random_seed(), level: practice.level };
  }
</script>

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <Segmented size="sm" class="hidden @3xl:inline-flex" label="Game" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
    <Select size="sm" class="w-36 @3xl:hidden" aria-label="Game" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
    <Segmented size="sm" label="Daily or practice" options={KIND_OPTIONS} bind:value={() => kind, set_kind} />
    <div class="flex-1"></div>
    {#if kind === Kind.PRACTICE}
      {#if leveled}
        <Segmented size="sm" label="Difficulty" options={level_options} bind:value={() => practice.level, set_level} />
      {/if}
      <Button size="sm" variant="primary" onclick={new_puzzle}>New puzzle</Button>
    {/if}
  </Toolbar>

  <div class="min-h-0 overflow-hidden">
    {#key run_key}
      {#if mode === Mode.RECALL}
        <Recall {...run} saved={saved(recall_state_schema)} />
      {:else if mode === Mode.ODD}
        <OddOneOut {...run} saved={saved(odd_state_schema)} />
      {:else if mode === Mode.SORT}
        <GradientSort {...run} saved={saved(sort_state_schema)} />
      {:else}
        <HexGuess {...run} saved={saved(hex_state_schema)} />
      {/if}
    {/key}
  </div>

  <StatusBar>
    <span class="shrink-0">{MODE_NAMES[mode]}</span>
    <span class="truncate">{where}</span>
    <span class="hidden truncate @2xl:inline pointer-coarse:hidden">{KEYS[mode]}</span>
  </StatusBar>
</div>

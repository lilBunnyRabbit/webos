<script lang="ts">
  import { track_play } from "$kit/games";
  import { RouteKind, route_url } from "$lib/core/api/services/router/route";
  import { Button, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { day_key } from "$lib/core/utils/date";
  import { random_seed } from "$lib/core/utils/random";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { TIER_NAMES, TIERS } from "./atlas";
  import Dex from "./dex.svelte";
  import {
    ATLAS_MODELS,
    challenge_props,
    dex_schema,
    draw_run,
    is_pool,
    MIXED,
    pool_label,
    puzzle_number,
    record_dex,
    resolve_seed,
    run_state_schema,
    share_head,
    type Pool,
    type RunState,
    type Seed,
  } from "./game";
  import Run from "./run.svelte";

  interface Props {
    seed?: Seed;
    daily?: string;
    pool?: string;
  }

  const View = { PLAY: "play", ATLAS: "atlas" } as const;
  type View = (typeof View)[keyof typeof View];
  const Kind = { DAILY: "daily", PRACTICE: "practice" } as const;
  type Kind = (typeof Kind)[keyof typeof Kind];

  const VIEW_OPTIONS = [
    { value: View.PLAY, label: "Play" },
    { value: View.ATLAS, label: "Atlas" },
  ];
  const KIND_OPTIONS = [
    { value: Kind.DAILY, label: "Daily" },
    { value: Kind.PRACTICE, label: "Practice" },
  ];
  const BASE_POOLS: Pool[] = [MIXED, ...TIERS];

  const props: Props = $props();
  const initial = untrack(() => ({ ...props }));

  const { app_id, window: win, storage } = get_app_context();
  const tracker = track_play(app_id, () => win.is_visible);
  // Fixed when the window opens: a daily started before midnight finishes as that day's.
  const today = day_key();

  const linked = initial.daily ?? initial.seed;
  // A link to today's run is today's daily; any other seed is a challenge, played like practice and never counted.
  const challenge = linked !== undefined && linked !== today ? linked : null;
  const linked_pool = initial.pool && is_pool(initial.pool) ? initial.pool : MIXED;

  const dex = storage.persisted("dex", {}, dex_schema);

  let view = $state<View>(View.PLAY);
  let kind = $state<Kind>(challenge === null ? Kind.DAILY : Kind.PRACTICE);
  let practice = $state<{ seed: Seed; pool: Pool }>({ seed: challenge ?? random_seed(), pool: challenge !== null ? linked_pool : MIXED });
  let open = $state<string | null>(null);

  const seed = $derived<Seed>(kind === Kind.DAILY ? today : practice.seed);
  const pool = $derived(kind === Kind.DAILY ? MIXED : practice.pool);
  const run_key = $derived(`${kind}|${seed}|${pool}`);
  const pool_options = $derived(
    (BASE_POOLS.includes(practice.pool) ? BASE_POOLS : [...BASE_POOLS, practice.pool]).map((value) => ({ value, label: pool_label(value) }))
  );
  const collected = $derived(ATLAS_MODELS.filter((item) => dex.value[item.id] !== undefined).length);
  const where = $derived(
    kind === Kind.DAILY ? `Daily #${puzzle_number(today)} · ${today}` : typeof seed === "string" ? `Challenge · ${seed}` : `Practice · ${pool_label(pool)}`
  );

  const run = $derived.by(() => {
    const counts = kind === Kind.DAILY;
    return {
      rounds: draw_run(resolve_seed(seed), pool),
      daily: counts,
      head: share_head(seed, pool),
      link: route_url({ kind: RouteKind.SOLO, id: app_id, props: challenge_props(seed, pool) }),
      saved: counts ? saved_daily() : null,
      next: counts ? { label: "Practice", run: () => (kind = Kind.PRACTICE) } : { label: "New run", run: new_run },
      onsave: (state: RunState) => {
        if (counts) storage.set("daily", { day: today, state });
      },
      onfinish: (ms: number, score: number) => {
        if (counts) tracker.daily(today, ms, score);
      },
    };
  });

  function saved_daily(): RunState | null {
    const entry = storage.get("daily", z.object({ day: z.string(), state: run_state_schema }));
    return entry?.day === today ? entry.state : null;
  }

  function on_round(model_id: string, delta: number) {
    dex.value = record_dex(dex.value, model_id, delta);
  }

  function set_view(next: View) {
    view = next;
  }

  function set_kind(next: Kind) {
    kind = next;
  }

  function set_pool(next: Pool) {
    practice = { seed: random_seed(), pool: next };
  }

  function new_run() {
    kind = Kind.PRACTICE;
    practice = { seed: random_seed(), pool: practice.pool };
  }

  function practice_model(id: string) {
    kind = Kind.PRACTICE;
    practice = { seed: random_seed(), pool: id };
    view = View.PLAY;
  }
</script>

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <Segmented size="sm" label="View" options={VIEW_OPTIONS} bind:value={() => view, set_view} />
    {#if view === View.PLAY}
      <Segmented size="sm" label="Daily or practice" options={KIND_OPTIONS} bind:value={() => kind, set_kind} />
      <div class="flex-1"></div>
      {#if kind === Kind.PRACTICE}
        <Select size="sm" class="w-36" aria-label="Models" options={pool_options} bind:value={() => practice.pool, set_pool} />
        <Button size="sm" variant="primary" onclick={new_run}>New run</Button>
      {/if}
    {/if}
  </Toolbar>

  <div class="min-h-0 overflow-hidden">
    {#if view === View.ATLAS}
      <Dex dex={dex.value} {open} onopen={(id) => (open = id)} onpractice={practice_model} />
    {:else}
      {#key run_key}
        <Run {...run} collected={new Set(Object.keys(dex.value))} onround={on_round} />
      {/key}
    {/if}
  </div>

  <StatusBar>
    <span class="truncate">{view === View.PLAY ? where : "Atlas"}</span>
    <span class="shrink-0">{collected} / {ATLAS_MODELS.length} collected</span>
    <span class="hidden truncate @2xl:inline pointer-coarse:hidden">Arrows adjust a slider · Enter submits</span>
  </StatusBar>
</div>

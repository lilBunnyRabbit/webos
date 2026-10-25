<script lang="ts" generics="State">
  import kernel, { type AppsService } from "$lib/core/api";
  import { track_play } from "$kit/games";
  import { RouteKind, route_url } from "$lib/core/api/services/router/route";
  import { Button, Segmented, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { day_key } from "$lib/core/utils/date";
  import { random_seed } from "$lib/core/utils/random";
  import { untrack, type Snippet } from "svelte";
  import { z, type ZodType } from "zod";
  import { Level, type Mode } from "./modes";
  import type { NextAction, RunProps } from "./run";
  import { puzzle_number, resolve_seed, type Seed } from "./seed";
  import { challenge_props, share_head } from "./share";

  interface Props {
    mode: Mode;
    seed?: Seed;
    daily?: string;
    level?: Level;
    /** The practice difficulty picker's labels; a game without levels always plays Easy. */
    levels?: Record<Level, string>;
    keys: string;
    schema: ZodType<State>;
    board: Snippet<[RunProps<State>]>;
  }

  const Kind = { DAILY: "daily", PRACTICE: "practice" } as const;
  type Kind = (typeof Kind)[keyof typeof Kind];

  const KIND_OPTIONS = [
    { value: Kind.DAILY, label: "Daily" },
    { value: Kind.PRACTICE, label: "Practice" },
  ];

  const props: Props = $props();
  const initial = untrack(() => ({ ...props }));

  const { app_id, window: win, storage } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));
  const name = $derived(apps.get(app_id)?.name ?? app_id);
  const tracker = track_play(app_id, () => win.is_visible);
  // Fixed when the window opens: a daily started before midnight finishes as that day's.
  const today = day_key();

  const linked = initial.daily ?? initial.seed;
  // A link to today's puzzle is today's daily; any other seed is a challenge, played like practice and never counted.
  const challenge = linked !== undefined && linked !== today ? linked : null;

  let kind = $state<Kind>(challenge === null ? Kind.DAILY : Kind.PRACTICE);
  let practice = $state<{ seed: Seed; level: Level }>(
    challenge !== null
      ? { seed: challenge, level: initial.level ?? Level.EASY }
      : { seed: random_seed(), level: storage.get("level", z.enum(Level)) ?? Level.EASY }
  );

  const level = $derived(kind === Kind.PRACTICE && props.levels ? practice.level : Level.EASY);
  const seed = $derived<Seed>(kind === Kind.DAILY ? today : practice.seed);
  const run_key = $derived(`${kind}|${seed}|${level}`);
  const level_options = $derived(Object.entries(props.levels ?? {}).map(([value, label]) => ({ value: value as Level, label })));
  const where = $derived(
    kind === Kind.DAILY ? `Daily #${puzzle_number(today)} · ${today}` : typeof seed === "string" ? `Challenge · ${seed}` : "Practice"
  );

  const run = $derived.by((): RunProps<State> => {
    const counts = kind === Kind.DAILY;
    const next: NextAction = counts ? { label: "Practice", run: () => set_kind(Kind.PRACTICE) } : { label: "New puzzle", run: new_puzzle };
    return {
      seed: resolve_seed(props.mode, seed),
      level,
      daily: counts,
      head: share_head(name, seed, level),
      link: route_url({ kind: RouteKind.SOLO, id: app_id, props: challenge_props(seed, level) }),
      saved: counts ? saved_daily() : null,
      next,
      onsave: (state: State) => {
        if (counts) storage.set("daily", { day: today, state });
      },
      onfinish: (ms: number, score?: number) => {
        if (counts) tracker.daily(today, ms, score);
      },
    };
  });

  function saved_daily(): State | null {
    const entry = storage.get("daily", z.object({ day: z.string(), state: props.schema }));
    return entry?.day === today ? (entry.state as State) : null;
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
    <Segmented size="sm" label="Daily or practice" options={KIND_OPTIONS} bind:value={() => kind, set_kind} />
    <div class="flex-1"></div>
    {#if kind === Kind.PRACTICE}
      {#if props.levels}
        <Segmented size="sm" label="Difficulty" options={level_options} bind:value={() => practice.level, set_level} />
      {/if}
      <Button size="sm" variant="primary" onclick={new_puzzle}>New puzzle</Button>
    {/if}
  </Toolbar>

  <div class="min-h-0 overflow-hidden">
    {#key run_key}
      {@render props.board(run)}
    {/key}
  </div>

  <StatusBar>
    <span class="truncate">{where}</span>
    <span class="hidden truncate @2xl:inline pointer-coarse:hidden">{props.keys}</span>
  </StatusBar>
</div>

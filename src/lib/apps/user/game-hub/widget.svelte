<script lang="ts">
  import kernel, { type AppsService, type WidgetProps } from "$lib/core/api";
    import { format_time, use_plays } from "$lib/core/games";
  import { cn } from "$lib/core/utils";
  import { ArrowSquareOut, CheckCircle, Fire } from "phosphor-svelte";
  import { format_duration, HUB_ID, highlight_dailies, list_games, streak, supports_daily, totals } from "./hub";
  import { use_today } from "./today.svelte";

  const {}: WidgetProps = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const plays = use_plays();
  const today = use_today();

  const dailies = $derived(list_games([...apps.list()].map(([, manifest]) => manifest)).filter((game) => supports_daily(game.props)));
  const solved_today = $derived(plays.value.daily[today.value] ?? {});
  const solved_count = $derived(dailies.filter((game) => solved_today[game.id]).length);
  const highlighted = $derived(highlight_dailies(dailies, plays.value, today.value));
  const current_streak = $derived(streak(plays.value, today.value));
  const played = $derived(totals(plays.value).ms);
</script>

<div class="flex h-full flex-col justify-center gap-2 p-2.5">
  <div class="flex items-center justify-around gap-2 rounded-lg bg-foreground/5 px-2 py-1.5">
    <div class="flex items-center gap-1.5">
      <Fire aria-hidden="true" class={cn("size-4", current_streak ? "text-primary" : "text-foreground/45")} weight={current_streak ? "fill" : "regular"} />
      <span class="font-mono text-ui font-semibold tabular-nums">{current_streak}</span>
      <span class="text-2xs text-foreground/65">streak</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="font-mono text-ui font-semibold tabular-nums">{solved_count}/{dailies.length}</span>
      <span class="text-2xs text-foreground/65">today</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="font-mono text-ui font-semibold tabular-nums">{format_duration(played)}</span>
      <span class="text-2xs text-foreground/65">played</span>
    </div>
  </div>

  <ul class="grid grid-cols-4 gap-1" aria-label="Puzzles of the day">
    {#each highlighted as game (game.id)}
      {@const solved = solved_today[game.id]}
      {@const Icon = game.icon}
      <li>
        <button
          class="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1 hover:bg-foreground/6 focus-visible:outline-2 focus-visible:outline-cottontail"
          title={solved ? `${game.name}: solved in ${format_time(solved.ms)}` : `${game.name}: today's puzzle`}
          onclick={() => apps.launch(game.id, { daily: today.value })}
        >
          <span class={cn("relative grid size-9 place-items-center rounded-lg ring-1", solved ? "bg-success/12 ring-success/40" : "bg-background ring-foreground/10 shadow-raised")}>
            <Icon class="size-5" weight="duotone" />
            {#if solved}<CheckCircle class="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-background text-success" weight="fill" />{/if}
          </span>
          <span class="w-full truncate text-center text-2xs">{game.name}</span>
        </button>
      </li>
    {/each}
    <li class="col-start-4">
      <button
        class="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1 hover:bg-foreground/6 focus-visible:outline-2 focus-visible:outline-cottontail"
        onclick={() => apps.launch(HUB_ID)}
      >
        <span class="grid size-9 place-items-center rounded-lg ring-1 ring-foreground/10"><ArrowSquareOut class="size-5" /></span>
        <span class="w-full truncate text-center text-2xs">Open hub</span>
      </button>
    </li>
  </ul>
</div>

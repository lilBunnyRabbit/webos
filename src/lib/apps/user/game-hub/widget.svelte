<script lang="ts">
  import { AppIcon } from "$lib/core/components/ui";
  import kernel, { type AppsService, type WidgetProps } from "$lib/core/api";
  import { format_time, use_plays } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import {
    ArrowSquareOut as ArrowSquareOutIcon,
    CheckCircle as CheckCircleIcon,
    Fire as FireIcon,
  } from "phosphor-svelte";
  import { daily_games, daily_props, format_duration, HUB_ID, highlight_dailies, list_games, streak, totals } from "./hub";
  import { use_today } from "./today.svelte";

  const { size }: WidgetProps = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const plays = use_plays();
  const today = use_today();

  const columns = $derived(Math.max(4, size.w));
  const slots = $derived(columns * Math.max(1, size.h - 1) - 1);

  const dailies = $derived(daily_games(list_games([...apps.list()].map(([, manifest]) => manifest))));
  const solved_today = $derived(plays.value.daily[today.value] ?? {});
  const solved_count = $derived(dailies.filter((entry) => solved_today[entry.key]).length);
  const highlighted = $derived(highlight_dailies(dailies, plays.value, today.value, slots));
  const current_streak = $derived(streak(plays.value, today.value));
  const played = $derived(totals(plays.value).ms);
</script>

<div class={cn("flex h-full flex-col justify-center gap-2", size.h < 2 ? "px-2" : "p-2.5")}>
  <div class="flex items-center justify-around gap-2 rounded-lg bg-field px-2 py-1.5 shadow-recessed">
    <div class="flex items-center gap-1.5">
      <FireIcon aria-hidden="true" class={cn("size-4", current_streak ? "text-primary" : "text-foreground/45")} weight={current_streak ? "fill" : "regular"} />
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

  {#if size.h >= 2}
    <ul class="grid gap-1" style:grid-template-columns="repeat({columns}, minmax(0, 1fr))" aria-label="Puzzles of the day">
      {#each highlighted as entry (entry.key)}
        {@const solved = solved_today[entry.key]}
        <li>
          <button
            class="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1 transition-[background-color,box-shadow] hover:bg-background-lighter hover:shadow-control active:shadow-pressed focus-visible:outline-2 focus-visible:outline-cottontail"
            title={solved ? `${entry.name}: solved in ${format_time(solved.ms)}${solved.score === undefined ? "" : `, score ${solved.score}`}` : `${entry.name}: today's puzzle`}
            onclick={() => apps.launch(entry.game.id, daily_props(entry, today.value))}
          >
            <span class={cn("relative grid size-9 place-items-center rounded-lg ring-1", solved ? "bg-success/12 ring-success/40" : "bg-background-lightest shadow-raised ring-hairline")}>
              <AppIcon src={entry.game.icon} class="size-5" />
              {#if solved}<CheckCircleIcon class="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-background text-success" weight="fill" />{/if}
            </span>
            <span class="w-full truncate text-center text-2xs">{entry.short}</span>
          </button>
        </li>
      {/each}
      <li style:grid-column="-2 / -1">
        <button
          class="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1 transition-[background-color,box-shadow] hover:bg-background-lighter hover:shadow-control active:shadow-pressed focus-visible:outline-2 focus-visible:outline-cottontail"
          onclick={() => apps.launch(HUB_ID)}
        >
          <span class="grid size-9 place-items-center rounded-lg bg-background-lightest shadow-raised ring-1 ring-hairline"><ArrowSquareOutIcon class="size-5" /></span>
          <span class="w-full truncate text-center text-2xs">Open hub</span>
        </button>
      </li>
    </ul>
  {/if}
</div>

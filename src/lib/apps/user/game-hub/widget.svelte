<script lang="ts">
  import kernel, { type AppsService, type WidgetProps } from "$lib/core/api";
  import { format_time, use_plays } from "$lib/core/games";
  import { cn } from "$lib/core/utils";
  import { CheckCircle, Circle, Fire } from "phosphor-svelte";
  import { list_games, streak, supports_daily } from "./hub";
  import { use_today } from "./today.svelte";

  const {}: WidgetProps = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const plays = use_plays();
  const today = use_today();

  const dailies = $derived(
    list_games([...apps.list()].map(([, manifest]) => manifest))
      .filter((game) => supports_daily(game.props))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
  const solved_today = $derived(plays.value.daily[today.value] ?? {});
  const current_streak = $derived(streak(plays.value, today.value));
</script>

<div class="flex h-full flex-col">
  <div class="flex items-center gap-2 border-b border-foreground/8 px-3 py-2">
    <Fire class={cn("size-5", current_streak ? "text-primary" : "text-foreground/45")} weight={current_streak ? "fill" : "regular"} />
    <p class="text-ui"><span class="font-mono font-semibold tabular-nums">{current_streak}</span> day streak</p>
    {#if dailies.length}
      <p class="ml-auto font-mono text-2xs text-foreground/65 tabular-nums">
        {dailies.filter((game) => solved_today[game.id]).length}/{dailies.length}
      </p>
    {/if}
  </div>
  <ul class="min-h-0 flex-1 overflow-auto p-1.5">
    {#each dailies as game (game.id)}
      {@const solved = solved_today[game.id]}
      <li>
        <button
          class="flex min-h-7 w-full items-center gap-2 rounded-md px-1.5 text-left hover:bg-foreground/6 focus-visible:outline-2 focus-visible:outline-cottontail"
          onclick={() => apps.launch(game.id, { daily: today.value })}
        >
          {#if solved}
            <CheckCircle class="size-4 shrink-0 text-success" weight="fill" />
          {:else}
            <Circle class="size-4 shrink-0 text-foreground/45" />
          {/if}
          <span class="min-w-0 flex-1 truncate text-ui">{game.name}</span>
          {#if solved}<span class="font-mono text-2xs text-foreground/65 tabular-nums">{format_time(solved.ms)}</span>{/if}
        </button>
      </li>
    {:else}
      <li class="px-1.5 py-1 text-ui text-foreground/55">No daily puzzles yet.</li>
    {/each}
  </ul>
</div>

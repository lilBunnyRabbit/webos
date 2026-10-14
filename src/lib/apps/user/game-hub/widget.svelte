<script lang="ts">
  import kernel, { type AppsService, type WidgetProps } from "$lib/core/api";
  import { format_time, use_plays } from "$lib/core/games";
  import { cn } from "$lib/core/utils";
  import { CheckCircle, Fire } from "phosphor-svelte";
  import { entries, list_games, Sort, sort_entries, streak, supports_daily } from "./hub";
  import { use_today } from "./today.svelte";

  const {}: WidgetProps = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const plays = use_plays();
  const today = use_today();

  const games = $derived(list_games([...apps.list()].map(([, manifest]) => manifest)));
  const recent = $derived(sort_entries(entries(games, plays.value), Sort.RECENT).map((entry) => entry.game));
  const dailies = $derived(games.filter((game) => supports_daily(game.props)).sort((a, b) => a.name.localeCompare(b.name)));
  const solved_today = $derived(plays.value.daily[today.value] ?? {});
  const solved_count = $derived(dailies.filter((game) => solved_today[game.id]).length);
  const current_streak = $derived(streak(plays.value, today.value));
</script>

<div class="flex h-full flex-col">
  <div class="flex items-center gap-2 border-b border-foreground/8 px-3 py-2">
    <Fire class={cn("size-5", current_streak ? "text-primary" : "text-foreground/45")} weight={current_streak ? "fill" : "regular"} />
    <p class="text-ui"><span class="font-mono font-semibold tabular-nums">{current_streak}</span> day streak</p>
    {#if dailies.length}
      <p class="ml-auto text-2xs text-foreground/65">
        Today <span class="font-mono tabular-nums">{solved_count}/{dailies.length}</span>
      </p>
    {/if}
  </div>

  <div class="min-h-0 flex-1 overflow-auto">
    {#if dailies.length}
      <p class="px-3 pt-2 pb-1 text-2xs font-semibold tracking-wide text-foreground/65 uppercase">Puzzles of the day</p>
      <ul class="flex flex-wrap gap-1 border-b border-foreground/8 px-2 pb-2" aria-label="Puzzles of the day">
        {#each dailies as game (game.id)}
          {@const solved = solved_today[game.id]}
          {@const Icon = game.icon}
          <li>
            <button
              class={cn(
                "relative grid size-9 place-items-center rounded-lg ring-1 hover:bg-foreground/6 focus-visible:outline-2 focus-visible:outline-cottontail",
                solved ? "bg-success/12 ring-success/40" : "ring-foreground/12"
              )}
              title={solved ? `${game.name}: solved in ${format_time(solved.ms)}` : `${game.name}: today's puzzle`}
              aria-label={solved ? `${game.name}, solved in ${format_time(solved.ms)}` : `${game.name}, today's puzzle`}
              onclick={() => apps.launch(game.id, { daily: today.value })}
            >
              <Icon class="size-4.5" weight="duotone" />
              {#if solved}
                <CheckCircle class="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-background text-success" weight="fill" />
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1 p-1.5" aria-label="Games">
      {#each recent as game (game.id)}
        {@const Icon = game.icon}
        <li>
          <button
            class="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 hover:bg-foreground/6 focus-visible:outline-2 focus-visible:outline-cottontail"
            title={game.name}
            onclick={() => apps.launch(game.id)}
          >
            <span class="grid size-9 place-items-center rounded-lg bg-background shadow-raised ring-1 ring-foreground/10">
              <Icon class="size-5" weight="duotone" />
            </span>
            <span class="w-full truncate text-center text-2xs">{game.name}</span>
          </button>
        </li>
      {:else}
        <li class="col-span-full px-1.5 py-1 text-ui text-foreground/55">No games installed.</li>
      {/each}
    </ul>
  </div>
</div>

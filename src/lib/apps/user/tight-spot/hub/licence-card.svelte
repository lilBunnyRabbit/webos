<script lang="ts">
  import kernel, { type AchievementsService } from "$lib/core/api";
  import { IconButton } from "$lib/core/components/ui";
  import { IdentificationCard as LicenceIcon, Star as StarIcon, Trophy as TrophyIcon } from "phosphor-svelte";
  import { add_progress, type Progress } from "../core/track";
  import type { GameDefinition } from "../games/define";

  interface Props {
    app_id: string;
    games: readonly GameDefinition[];
    progress: ReadonlyMap<string, Progress>;
    onfocus: () => void;
    panel?: HTMLDivElement;
  }

  let { app_id, games, progress, onfocus, panel = $bindable() }: Props = $props();

  const uid = $props.id();
  const achievements = $derived(kernel.service<AchievementsService>("achievements"));
  const unlocked = $derived.by(() => {
    const ids = new Set(achievements.list(app_id).flatMap((entry) => (entry.unlocked ? [entry.def.id] : [])));
    return new Map(games.map((game) => [game.id, game.achievements.filter((each) => ids.has(each.id)).length]));
  });
  const stars = $derived(add_progress(...progress.values()));

  // Closed, the keys go back to the board unless the click that closed it went to another control.
  function on_toggle(event: ToggleEvent) {
    if (event.newState !== "closed") return;
    const active = document.activeElement;
    if (!active || active === document.body || panel?.contains(active) || active.getAttribute("popovertarget") === panel?.id) onfocus();
  }
</script>

<IconButton size="sm" label="Licence" popovertarget="ts-licence-{uid}" style="anchor-name: --ts-licence-{uid}">
  <LicenceIcon weight="bold" />
</IconButton>

<div
  bind:this={panel}
  id="ts-licence-{uid}"
  popover="auto"
  class="ts-licence m-0 w-72 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
  style="position-anchor: --ts-licence-{uid}"
  ontoggle={on_toggle}
>
  <div class="flex items-baseline justify-between gap-3">
    <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Driving licence</p>
    {#if stars.total}
      <p class="flex items-center gap-1 text-ui tabular-nums"><StarIcon weight="fill" class="size-3.5 text-primary" /><span>{stars.stars}<span class="text-foreground/65">/{stars.total}</span></span></p>
    {/if}
  </div>
  <ul class="mt-2 flex flex-col">
    {#each games as game (game.id)}
      {@const got = progress.get(game.id)}
      <li class="flex min-h-8 items-center gap-2 text-ui pointer-coarse:min-h-11">
        <game.icon weight="duotone" class="size-4 shrink-0 text-foreground/80" />
        <span class="min-w-0 flex-1 truncate">{game.name}</span>
        {#if got}
          <span class="flex items-center gap-1 tabular-nums" aria-label="{got.stars} of {got.total} stars">
            <StarIcon weight="fill" class="size-3.5 text-primary" /><span>{got.stars}<span class="text-foreground/65">/{got.total}</span></span>
          </span>
        {/if}
        <span class="flex w-12 items-center justify-end gap-1 text-foreground/65 tabular-nums" aria-label="{unlocked.get(game.id) ?? 0} of {game.achievements.length} achievements">
          <TrophyIcon weight="fill" class="size-3.5" /><span>{unlocked.get(game.id) ?? 0}/{game.achievements.length}</span>
        </span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .ts-licence {
    position-area: bottom span-left;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }
</style>

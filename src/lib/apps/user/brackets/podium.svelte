<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { Medal as MedalIcon, Trophy as TrophyIcon } from "phosphor-svelte";
  import type { Place } from "./state";

  interface Props {
    places: Place[];
    names: Map<string, string>;
  }

  let { places, names }: Props = $props();

  const list = (ids: string[]) => ids.map((id) => names.get(id) ?? id).join(" & ");
  const ORDINALS = ["", "1st", "2nd", "3rd"];
  const champion = $derived(places.find((place) => place.place === 1));
  const rest = $derived(places.filter((place) => place.place > 1));
</script>

{#if champion}
  <section class="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl bg-background-light p-4 shadow-card ring-1 ring-hairline" aria-live="polite">
    <div class="flex min-w-0 items-center gap-3">
      <div class="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
        <TrophyIcon class="size-6" weight="fill" />
      </div>
      <div class="min-w-0">
        <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{champion.players.length > 1 ? "Champions" : "Champion"}</p>
        <p class="truncate text-xl font-semibold">{list(champion.players)}</p>
      </div>
    </div>
    {#if rest.length}
      <ol class="flex min-w-0 flex-col gap-1 text-ui">
        {#each rest as place (place.place)}
          <li class="flex min-w-0 items-center gap-2">
            <MedalIcon class={cn("size-4 shrink-0", place.place === 2 ? "text-foreground/80" : "text-foreground/55")} weight="duotone" />
            <span class="w-7 shrink-0 font-mono text-2xs text-foreground/65">{ORDINALS[place.place]}</span>
            <span class="truncate">{list(place.players)}</span>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
{/if}

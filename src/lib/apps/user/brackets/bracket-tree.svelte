<script lang="ts" module>
  import type { MatchState } from "./elimination";

  export interface TreeRound {
    label: string;
    matches: MatchState[];
  }
</script>

<script lang="ts">
  import { cn } from "$lib/core/utils";
  import MatchCard from "./match-card.svelte";

  interface Props {
    rounds: TreeRound[];
    names: Map<string, string>;
    seeds: Map<string, number>;
    editable: (match: string) => boolean;
    onpick: (match: string, winner: string) => void;
  }

  let { rounds, names, seeds, editable, onpick }: Props = $props();

  // Two matches feeding one in the next round share a bracket line; a round that doesn't halve connects straight across.
  function groups(index: number): MatchState[][] {
    const round = rounds[index].matches;
    const next = rounds[index + 1]?.matches;
    const size = next && next.length * 2 === round.length ? 2 : 1;
    const result: MatchState[][] = [];
    for (let i = 0; i < round.length; i += size) result.push(round.slice(i, i + size));
    return result;
  }
</script>

<div class="flex w-max gap-8">
  {#each rounds as round, index (round.label)}
    {@const has_next = index < rounds.length - 1}
    {@const has_previous = index > 0}
    <div class="flex w-44 flex-col @md:w-52">
      <h3 class="mb-2 px-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{round.label}</h3>
      <div class="flex flex-1 flex-col">
        {#each groups(index) as group (group[0].spec.id)}
          <div
            class={cn(
              "relative flex flex-1 flex-col",
              has_next && group.length === 2 && "after:absolute after:inset-y-1/4 after:-right-4 after:border-r after:border-foreground/20"
            )}
          >
            {#each group as match (match.spec.id)}
              <div
                class={cn(
                  "relative flex flex-1 items-center py-1.5",
                  has_next && "after:absolute after:top-1/2 after:-right-4 after:w-4 after:border-t after:border-foreground/20",
                  has_previous && "before:absolute before:top-1/2 before:-left-4 before:w-4 before:border-t before:border-foreground/20"
                )}
              >
                <MatchCard state={match} {names} {seeds} editable={editable(match.spec.id)} {onpick} />
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

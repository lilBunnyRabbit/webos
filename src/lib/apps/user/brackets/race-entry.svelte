<script lang="ts">
  import { Button } from "$lib/core/components/ui";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, FlagCheckered as FlagCheckeredIcon } from "phosphor-svelte";
  import { points_for } from "./cup";

  interface Props {
    title: string;
    players: string[];
    points: number[];
    names: Map<string, string>;
    onsave: (order: string[]) => void;
  }

  let { title, players, points, names, onsave }: Props = $props();

  let order = $state<string[]>([]);
  const left = $derived(players.filter((player) => !order.includes(player)));
  const complete = $derived(order.length === players.length);

  function place(player: string) {
    const next = [...order, player];
    const remaining = players.filter((candidate) => !next.includes(candidate));
    order = remaining.length === 1 ? [...next, remaining[0]] : next;
  }
</script>

<section class="flex flex-col gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8">
  <header class="flex items-center gap-2">
    <FlagCheckeredIcon class="size-4 shrink-0 text-primary" weight="duotone" />
    <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
    {#if order.length}
      <Button size="sm" variant="quiet" onclick={() => (order = order.slice(0, -1))}>
        <ArrowCounterClockwiseIcon weight="bold" />Back
      </Button>
    {/if}
    <Button size="sm" variant="primary" disabled={!complete} onclick={() => onsave(order)}>Save race</Button>
  </header>

  {#if !complete}
    <p class="text-2xs text-foreground/65">Tap the players in finishing order. Next: {order.length + 1}{order.length === 0 ? "st" : order.length === 1 ? "nd" : order.length === 2 ? "rd" : "th"} place.</p>
    <div class="grid grid-cols-2 gap-1.5 @md:grid-cols-3 @2xl:grid-cols-4">
      {#each left as player (player)}
        <Button size="md" class="justify-start" onclick={() => place(player)}>
          <span class="truncate">{names.get(player)}</span>
        </Button>
      {/each}
    </div>
  {/if}

  {#if order.length}
    <ol class="grid grid-cols-1 gap-x-4 gap-y-0.5 @md:grid-cols-2">
      {#each order as player, index (player)}
        <li class="flex h-7 min-w-0 items-center gap-2 text-ui">
          <span class="w-6 shrink-0 text-right font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}.</span>
          <span class="min-w-0 flex-1 truncate">{names.get(player)}</span>
          <span class="font-mono text-2xs text-foreground/65 tabular-nums">+{points_for(points, index)}</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>

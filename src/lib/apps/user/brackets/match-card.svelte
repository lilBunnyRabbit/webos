<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { Check as CheckIcon } from "phosphor-svelte";
  import { MatchStatus, type MatchState, type Slot } from "./elimination";

  interface Props {
    state: MatchState;
    names: Map<string, string>;
    seeds: Map<string, number>;
    editable: boolean;
    onpick: (match: string, winner: string) => void;
  }

  let { state, names, seeds, editable, onpick }: Props = $props();

  const walkover = $derived(state.status === MatchStatus.WALKOVER);
  const ready = $derived(state.status === MatchStatus.READY);
</script>

{#snippet row(slot: Slot)}
  {@const won = state.winner.kind === "player" && slot.kind === "player" && state.winner.id === slot.id}
  {@const lost = state.status === MatchStatus.DONE && !won}
  {#if slot.kind === "player"}
    <button
      type="button"
      disabled={!editable}
      title={editable ? (won ? "Clear this result" : `${names.get(slot.id)} wins`) : undefined}
      class={cn(
        "flex h-8 w-full min-w-0 items-center gap-2 px-2 text-left text-ui transition-colors",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cottontail",
        editable && "cursor-pointer hover:bg-foreground/6",
        won && state.status === MatchStatus.DONE && "bg-primary/14 font-medium text-primary hover:bg-primary/20",
        lost && "text-foreground/50"
      )}
      onclick={() => onpick(state.spec.id, slot.id)}
    >
      <span class="w-5 shrink-0 text-right font-mono text-2xs text-foreground/50 tabular-nums">{seeds.get(slot.id)}</span>
      <span class="min-w-0 flex-1 truncate">{names.get(slot.id)}</span>
      {#if won && state.status === MatchStatus.DONE}<CheckIcon class="size-3.5 shrink-0" weight="bold" />{/if}
    </button>
  {:else}
    <div class="flex h-8 items-center gap-2 px-2 text-ui text-foreground/40">
      <span class="w-5 shrink-0"></span>
      <span class="italic">{slot.kind === "bye" ? "bye" : "…"}</span>
    </div>
  {/if}
{/snippet}

<div
  data-status={state.status}
  class={cn(
    "w-full overflow-hidden rounded-lg bg-background-light ring-1 ring-hairline shadow-raised",
    ready && "ring-primary/50",
    walkover && "opacity-60"
  )}
>
  {@render row(state.a)}
  <div class="h-px bg-foreground/8"></div>
  {@render row(state.b)}
</div>

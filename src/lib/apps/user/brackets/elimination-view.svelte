<script lang="ts">
  import { FormatKind } from "./bracket";
  import BracketTree, { type TreeRound } from "./bracket-tree.svelte";
  import { MatchStatus, round_name, rounds_of, Side } from "./elimination";
  import MatchCard from "./match-card.svelte";
  import type { EliminationView } from "./state";

  interface Props {
    view: EliminationView;
    names: Map<string, string>;
    seeds: Map<string, number>;
    editable: (match: string) => boolean;
    onpick: (match: string, winner: string) => void;
  }

  let { view, names, seeds, editable, onpick }: Props = $props();

  const double = $derived(view.kind === FormatKind.DOUBLE);

  const winners = $derived.by<TreeRound[]>(() => {
    const rounds = rounds_of(view.plan, view.states, Side.WINNERS);
    const tree = rounds.map((matches, index) => {
      const last = index === rounds.length - 1;
      const label = double ? (last ? "Winners final" : `Round ${index + 1}`) : round_name(Side.WINNERS, index + 1, rounds.length);
      return { label, matches };
    });
    if (!double) return tree;
    const final = view.states.get(view.plan.final);
    if (final) tree.push({ label: "Grand final", matches: [final] });
    const reset = view.plan.reset ? view.states.get(view.plan.reset) : undefined;
    if (reset && reset.status !== MatchStatus.SKIPPED) {
      tree.push({ label: reset.status === MatchStatus.PENDING ? "Reset, if needed" : "Reset", matches: [reset] });
    }
    return tree;
  });

  const losers = $derived.by<TreeRound[]>(() => {
    const rounds = rounds_of(view.plan, view.states, Side.LOSERS);
    return rounds.map((matches, index) => ({ label: round_name(Side.LOSERS, index + 1, rounds.length), matches }));
  });

  const third = $derived(view.plan.third ? view.states.get(view.plan.third) : undefined);
</script>

<div class="flex w-max flex-col gap-6 p-4">
  <section class="flex flex-col gap-2">
    {#if double}<h2 class="px-1 text-sm font-semibold">Winners bracket</h2>{/if}
    <BracketTree rounds={winners} {names} {seeds} {editable} {onpick} />
  </section>

  {#if losers.length}
    <section class="flex flex-col gap-2">
      <h2 class="px-1 text-sm font-semibold">Losers bracket</h2>
      <BracketTree rounds={losers} {names} {seeds} {editable} {onpick} />
    </section>
  {/if}

  {#if third}
    <section class="flex w-44 flex-col gap-2 @md:w-52">
      <h3 class="px-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Third place</h3>
      <MatchCard state={third} {names} {seeds} editable={editable(third.spec.id)} {onpick} />
    </section>
  {/if}
</div>

<script lang="ts">
  import { Button, Input } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import type { Fixture } from "./round-robin";
  import { score_outcome, type RoundRobinView } from "./state";

  interface Props {
    view: RoundRobinView;
    names: Map<string, string>;
    onpick: (match: string, winner: string | null, score?: [number, number]) => void;
  }

  let { view, names, onpick }: Props = $props();

  const scored = $derived([...view.results.values()].some((result) => result.score));
  const header = "text-2xs font-medium tracking-wide text-foreground/65 uppercase";

  function submit_score(fixture: Fixture, form: HTMLFormElement) {
    const data = new FormData(form);
    const a = String(data.get("a") ?? "").trim();
    const b = String(data.get("b") ?? "").trim();
    if (a === "" || b === "") return;
    const score: [number, number] = [Math.max(0, Math.round(Number(a))), Math.max(0, Math.round(Number(b)))];
    if (!score.every(Number.isFinite)) return;
    onpick(fixture.id, score_outcome(fixture.a, fixture.b, score), score);
  }
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
  <section class="flex flex-col gap-2">
    <h2 class="px-1 text-sm font-semibold">Standings</h2>
    <div class="overflow-hidden rounded-xl bg-background-light shadow-card ring-1 ring-hairline">
      <table class="w-full text-ui tabular-nums">
        <thead>
          <tr class="h-8 border-b border-hairline {header}">
            <th class="w-10 pl-3 text-left font-medium">#</th>
            <th class="text-left font-medium">Player</th>
            <th class="hidden w-10 text-right font-medium @md:table-cell" title="Played">P</th>
            <th class="w-10 text-right font-medium" title="Won">W</th>
            <th class="w-10 text-right font-medium" title="Drawn">D</th>
            <th class="w-10 text-right font-medium" title="Lost">L</th>
            {#if scored}<th class="hidden w-14 text-right font-medium @md:table-cell" title="Score difference">+/−</th>{/if}
            <th class="w-14 pr-3 text-right font-medium" title="Points">Pts</th>
          </tr>
        </thead>
        <tbody>
          {#each view.standings as row (row.player)}
            <tr class="h-8 border-b border-hairline last:border-0">
              <td class="pl-3 font-mono text-2xs text-foreground/65">{row.rank}</td>
              <td class="max-w-0 truncate pr-2">{names.get(row.player)}</td>
              <td class="hidden text-right font-mono text-2xs text-foreground/65 @md:table-cell">{row.played}</td>
              <td class="text-right font-mono text-2xs">{row.won}</td>
              <td class="text-right font-mono text-2xs">{row.drawn}</td>
              <td class="text-right font-mono text-2xs">{row.lost}</td>
              {#if scored}
                <td class="hidden text-right font-mono text-2xs text-foreground/65 @md:table-cell">
                  {row.scored - row.conceded > 0 ? "+" : ""}{row.scored - row.conceded}
                </td>
              {/if}
              <td class="pr-3 text-right font-mono text-2xs font-semibold">{row.points}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="px-1 text-2xs text-foreground/65">
      Win {view.format.win}, draw {view.format.draw}, loss {view.format.loss}. Ties: points between the tied players, then score difference, then
      scored.
    </p>
  </section>

  {#each view.rounds as round (round.round)}
    <section class="flex flex-col gap-2">
      <h2 class="flex items-baseline gap-2 px-1 text-sm font-semibold">
        Round {round.round}
        {#if round.resting}<span class="text-2xs font-normal text-foreground/65">{names.get(round.resting)} sits out</span>{/if}
      </h2>
      <div class="flex flex-col divide-y divide-hairline rounded-xl bg-background-light shadow-card ring-1 ring-hairline">
        {#each round.fixtures as fixture (fixture.id)}
          {@const result = view.results.get(fixture.id)}
          {#snippet side(player: string, align: "left" | "right")}
            {@const won = result?.winner === player}
            <button
              type="button"
              class={cn(
                "flex h-8 min-w-0 items-center rounded-md px-2 text-ui transition-colors hover:bg-foreground/6",
                "focus-visible:outline-2 focus-visible:outline-cottontail",
                align === "right" ? "justify-end text-right" : "justify-start text-left",
                won && "bg-primary/14 font-medium text-primary hover:bg-primary/20",
                result && result.winner !== null && !won && "text-foreground/50"
              )}
              title={won ? "Clear this result" : `${names.get(player)} wins`}
              onclick={() => onpick(fixture.id, player)}
            >
              <span class="truncate">{names.get(player)}</span>
            </button>
          {/snippet}
          <div data-status={result ? "done" : "ready"} class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 p-1">
            {@render side(fixture.a, "right")}
            <form
              class="flex items-center gap-1"
              onsubmit={(event) => {
                event.preventDefault();
                submit_score(fixture, event.currentTarget);
              }}
              onchange={(event) => submit_score(fixture, event.currentTarget)}
            >
              <Input
                name="a"
                type="number"
                min="0"
                inputmode="numeric"
                aria-label="{names.get(fixture.a)} score"
                value={result?.score?.[0] ?? ""}
                size="sm"
                class="w-10 px-1 text-center font-mono text-2xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <Button
                size="sm"
                variant="quiet"
                pressed={result?.winner === null}
                title={result?.winner === null ? "Clear this result" : "Draw"}
                onclick={() => onpick(fixture.id, null)}
              >
                {result?.winner === null ? "Draw" : "vs"}
              </Button>
              <Input
                name="b"
                type="number"
                min="0"
                inputmode="numeric"
                aria-label="{names.get(fixture.b)} score"
                value={result?.score?.[1] ?? ""}
                size="sm"
                class="w-10 px-1 text-center font-mono text-2xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </form>
            {@render side(fixture.b, "left")}
          </div>
        {/each}
      </div>
    </section>
  {/each}
</div>

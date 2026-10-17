<script lang="ts">
  import { Select } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { CupStage } from "./bracket";
  import { group_label, type CupRow, type CupTable, type NextRace } from "./cup";
  import RaceEntry from "./race-entry.svelte";
  import type { CupView } from "./state";

  interface Props {
    view: CupView;
    names: Map<string, string>;
    onrace: (race: NextRace, order: string[]) => void;
  }

  let { view, names, onrace }: Props = $props();

  const cup = $derived(view.cup);
  const grouped = $derived(cup.groups.length > 1);
  const header = "text-2xs font-medium tracking-wide text-foreground/65 uppercase";

  let chosen = $state<string | null>(null);
  const key = (race: NextRace) => `${race.stage}-${race.group}-${race.race}`;
  const options = $derived(cup.next.map((race) => ({ value: String(race.group), label: group_label(race.group) })));
  const entry = $derived(cup.next.find((race) => String(race.group) === chosen) ?? cup.next[0]);

  function table_of(race: NextRace): CupTable {
    return race.stage === CupStage.FINAL ? cup.final! : cup.groups[race.group];
  }

  const races_label = (table: CupTable) => `${table.races.length} of ${view.format.races} races`;

  function entry_title(race: NextRace): string {
    const where = race.stage === CupStage.FINAL ? "Final" : grouped ? group_label(race.group) : "";
    return `${where ? `${where} · ` : ""}Race ${race.race + 1} of ${view.format.races}`;
  }
</script>

{#snippet standings(title: string, rows: CupRow[], subtitle: string)}
  <section class="flex flex-col gap-2">
    <h2 class="flex items-baseline gap-2 px-1 text-sm font-semibold">
      {title}
      <span class="text-2xs font-normal text-foreground/65">{subtitle}</span>
    </h2>
    <div class="overflow-x-auto rounded-xl bg-background-light ring-1 ring-foreground/8">
      <table class="w-full text-ui tabular-nums">
        <thead>
          <tr class="h-8 border-b border-foreground/8 {header}">
            <th class="w-10 pl-3 text-left font-medium">#</th>
            <th class="text-left font-medium">Player</th>
            {#each { length: view.format.races }, race (race)}
              <th class="hidden w-9 text-right font-medium @lg:table-cell">R{race + 1}</th>
            {/each}
            <th class="w-16 pr-3 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.player)}
            <tr class="h-8 border-b border-foreground/5 last:border-0">
              <td class="pl-3 font-mono text-2xs text-foreground/65">{row.rank}</td>
              <td class="max-w-0 truncate pr-2">{names.get(row.player)}</td>
              {#each row.races as points, race (race)}
                <td class={cn("hidden text-right font-mono text-2xs @lg:table-cell", row.places[race] === 0 ? "font-semibold text-primary" : "text-foreground/65")}>
                  {points ?? "·"}
                </td>
              {/each}
              <td class="pr-3 text-right font-mono text-2xs font-semibold">{row.total}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/snippet}

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
  {#if entry}
    <div class="flex flex-col gap-2">
      {#if options.length > 1}
        <div class="flex items-center gap-2 px-1">
          <span class="text-ui text-foreground/65">Enter a race for</span>
          <Select size="sm" class="w-32" aria-label="Group" options={options} value={String(entry.group)} onchange={(event) => (chosen = event.currentTarget.value)} />
        </div>
      {/if}
      {#key key(entry)}
        <RaceEntry
          title={entry_title(entry)}
          players={table_of(entry).players}
          points={view.format.points}
          {names}
          onsave={(order) => onrace(entry, order)}
        />
      {/key}
    </div>
  {/if}

  {#if cup.final}
    {#if cup.final.players.length}
      {@render standings("Final", cup.final.standings, races_label(cup.final))}
    {:else}
      <p class="rounded-xl bg-foreground/4 px-4 py-3 text-ui text-foreground/65">
        The top {view.format.advance} of each group race the final once every group is done.
      </p>
    {/if}
  {/if}

  {#if grouped && !cup.final}
    {@render standings("Overall", cup.overall, "all groups")}
  {/if}

  {#each cup.groups as group, index (index)}
    {@render standings(grouped ? group_label(index) : "Standings", group.standings, races_label(group))}
  {/each}

  <p class="px-1 text-2xs text-foreground/65">
    Points by place: {view.format.points.join(", ")}{view.format.points.length < view.format.race_size ? ", then 0" : ""}. Ties go to more wins, then more
    second places, and so on.
  </p>
</div>

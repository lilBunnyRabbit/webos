<script lang="ts">
  import { Badge, Segmented } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { AdrStatus, STATUS_LABELS, STATUS_TONES } from "../adr-index";
  import type { Library } from "../library";

  interface Props {
    library: Library;
    onopen: (id: string) => void;
  }

  let { library, onopen }: Props = $props();

  const Filter = { ALL: "all", ...AdrStatus } as const;
  type Filter = (typeof Filter)[keyof typeof Filter];
  let filter = $state<Filter>(Filter.ALL);

  const DOT: Record<AdrStatus, string> = {
    implemented: "bg-success",
    accepted: "bg-primary",
    superseded: "bg-warning",
    closed: "bg-foreground/40",
  };

  const counts = $derived(
    Object.values(AdrStatus).map((kind) => ({ kind, count: library.adrs.filter((entry) => entry.kind === kind).length }))
  );
  const options = $derived([
    { value: Filter.ALL, label: `All ${library.adrs.length}` },
    ...counts.filter((item) => item.count > 0 && item.kind !== AdrStatus.CLOSED && item.kind !== AdrStatus.SUPERSEDED).map((item) => ({ value: item.kind, label: `${STATUS_LABELS[item.kind]} ${item.count}` })),
  ]);
  const shown = $derived(library.adrs.filter((entry) => filter === Filter.ALL || entry.kind === filter).slice().sort((a, b) => b.number - a.number));
  const months = $derived.by(() => {
    const groups = new Map<string, typeof shown>();
    for (const entry of shown) {
      const month = entry.date.slice(0, 7);
      groups.set(month, [...(groups.get(month) ?? []), entry]);
    }
    return [...groups.entries()];
  });
  const revised = $derived(library.adrs.reduce((sum, entry) => sum + entry.revisions, 0));

  function month_label(month: string): string {
    const [year, index] = month.split("-").map(Number);
    return new Date(year, index - 1, 1).toLocaleDateString("en", { month: "long", year: "numeric" });
  }
</script>

<section class="flex flex-col gap-4" aria-label="Decision timeline">
  <div class="flex flex-col gap-2 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8">
    <div class="flex h-2.5 overflow-hidden rounded-full bg-foreground/8" role="img" aria-label="Decisions by status">
      {#each counts as item (item.kind)}
        {#if item.count > 0}<span class={cn("h-full border-r-2 border-background-light last:border-r-0", DOT[item.kind])} style:flex-grow={item.count}></span>{/if}
      {/each}
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-foreground/80">
      {#each counts as item (item.kind)}
        {#if item.count > 0}
          <span class="flex items-center gap-1.5"><span class={cn("size-2 rounded-full", DOT[item.kind])}></span>{STATUS_LABELS[item.kind]} <span class="font-mono tabular-nums">{item.count}</span></span>
        {/if}
      {/each}
      <span class="ml-auto"><span class="font-mono tabular-nums">{revised}</span> revision notes written after the fact</span>
    </div>
  </div>

  <Segmented bind:value={filter} {options} label="Show" size="sm" />

  {#each months as [month, entries] (month)}
    <div class="flex flex-col">
      <h3 class="sticky top-0 z-1 bg-background/95 py-1.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase backdrop-blur-sm">{month_label(month)}</h3>
      <ol class="relative ml-1.5 border-l border-foreground/12">
        {#each entries as entry (entry.number)}
          <li class="relative">
            <span class={cn("absolute top-3.5 -left-[4.5px] size-2 rounded-full ring-2 ring-background", DOT[entry.kind])}></span>
            <button
              class="flex w-full flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-lg py-2 pr-2 pl-4 text-left transition-colors hover:bg-foreground/5 pointer-coarse:py-3"
              onclick={() => onopen(entry.id)}
            >
              <span class="font-mono text-2xs text-foreground/65 tabular-nums">{entry.date.slice(5)}</span>
              <span class="font-mono text-2xs font-semibold text-primary tabular-nums">{String(entry.number).padStart(3, "0")}</span>
              <span class="min-w-0 flex-1 text-ui font-medium">{entry.title}</span>
              <span class="flex items-center gap-1.5">
                {#if entry.revisions > 0}
                  <span class="font-mono text-2xs text-foreground/65 tabular-nums" title="{entry.revisions} revision notes">+{entry.revisions} rev</span>
                {/if}
                <Badge tone={STATUS_TONES[entry.kind]}>{entry.status.length > 24 ? STATUS_LABELS[entry.kind] : entry.status}</Badge>
              </span>
            </button>
          </li>
        {/each}
      </ol>
    </div>
  {/each}
</section>

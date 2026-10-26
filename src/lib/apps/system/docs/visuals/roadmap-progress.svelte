<script lang="ts">
  import { count_status, ItemStatus, parse_roadmap, type RoadmapSection } from "$kit/utils/roadmap";
  import { cn } from "$lib/core/utils";

  interface Props {
    markdown: string;
    compact?: boolean;
  }

  let { markdown, compact = false }: Props = $props();

  const sections = $derived(parse_roadmap(markdown));
  const total = $derived(count_status(sections));
  const all = $derived(total.done + total.partial + total.planned);
  const groups = $derived.by(() => {
    const by_group = new Map<string, RoadmapSection[]>();
    for (const section of sections) by_group.set(section.group, [...(by_group.get(section.group) ?? []), section]);
    return [...by_group.entries()]
      .map(([group, items]) => ({ group, ...count_status(items) }))
      .filter((group) => group.done + group.partial + group.planned > 0);
  });

  const BARS = [
    { status: ItemStatus.DONE, class: "bg-success", label: "done" },
    { status: ItemStatus.PARTIAL, class: "bg-warning", label: "in progress" },
    { status: ItemStatus.PLANNED, class: "bg-foreground/20", label: "planned" },
  ];
</script>

{#snippet bar(counts: Record<ItemStatus, number>, tall: boolean)}
  <div class={cn("flex overflow-hidden rounded-full bg-foreground/8", tall ? "h-3" : "h-1.5")}>
    {#each BARS as item (item.status)}
      {#if counts[item.status] > 0}<span class={cn("h-full", item.class)} style:flex-grow={counts[item.status]}></span>{/if}
    {/each}
  </div>
{/snippet}

<section class="flex flex-col gap-3 rounded-xl bg-background-light p-4 ring-1 ring-foreground/8" aria-label="Roadmap progress">
  <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <span class="font-mono text-2xl font-semibold tabular-nums">{all === 0 ? 0 : Math.round((total.done / all) * 100)}%</span>
    <span class="text-ui text-foreground/80">of {all} roadmap items done</span>
  </div>
  {@render bar(total, true)}
  <div class="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-foreground/80">
    {#each BARS as item (item.status)}
      <span class="flex items-center gap-1.5"><span class={cn("size-2 rounded-full", item.class)}></span><span class="font-mono tabular-nums">{total[item.status]}</span> {item.label}</span>
    {/each}
  </div>
  {#if !compact}
    <ul class="mt-1 grid gap-x-6 gap-y-2.5 @xl:grid-cols-2">
      {#each groups as group (group.group)}
        <li class="flex flex-col gap-1">
          <span class="flex items-baseline gap-2 text-ui">
            <span class="min-w-0 flex-1 truncate">{group.group}</span>
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">{group.done}/{group.done + group.partial + group.planned}</span>
          </span>
          {@render bar(group, false)}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<script lang="ts">
  import { Segmented, Spinner } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { CheckCircle as CheckCircleIcon, Circle as CircleIcon, CircleHalf as CircleHalfIcon } from "phosphor-svelte";
  import { count_status, ItemStatus, parse_roadmap, type RoadmapSection } from "../roadmap";

  const Filter = { ALL: "all", OPEN: "open", DONE: "done" } as const;
  type Filter = (typeof Filter)[keyof typeof Filter];

  const FILTERS = [
    { value: Filter.ALL, label: "All" },
    { value: Filter.OPEN, label: "Open" },
    { value: Filter.DONE, label: "Done" },
  ];

  let filter = $state<Filter>(Filter.OPEN);

  // The repo's own roadmap, bundled as text into this lazy chunk; it's always the one this build shipped with.
  const loading = import("../../../../../../docs/ROADMAP.md?raw").then((module) => parse_roadmap(module.default));

  function visible(sections: RoadmapSection[]): RoadmapSection[] {
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => (filter === Filter.ALL ? true : filter === Filter.DONE ? item.status === ItemStatus.DONE : item.status !== ItemStatus.DONE)),
      }))
      .filter((section) => section.items.length > 0);
  }
</script>

{#await loading}
  <div class="grid place-items-center py-10"><Spinner /></div>
{:then sections}
  {@const counts = count_status(sections)}
  <div class="flex flex-col gap-4">
    <p class="text-ui text-foreground/65">
      What's built and what's next. <span class="font-mono tabular-nums">{counts.done}</span> done,
      <span class="font-mono tabular-nums">{counts.partial}</span> in progress,
      <span class="font-mono tabular-nums">{counts.planned}</span> planned.
    </p>
    <Segmented bind:value={filter} options={FILTERS} label="Show" size="sm" />

    {#each visible(sections) as section (section.group + section.title)}
      <article class="flex flex-col gap-2 rounded-xl bg-background-light p-4 shadow-card ring-1 ring-hairline">
        <header class="flex flex-wrap items-baseline gap-x-2">
          <h2 class="text-sm font-semibold">{section.title}</h2>
          {#if section.title !== section.group}<span class="text-2xs text-foreground/55">{section.group}</span>{/if}
        </header>
        <ul class="flex flex-col gap-1">
          {#each section.items as item, index (index)}
            <li class="flex items-start gap-2 text-ui" style:padding-inline-start="{item.depth * 1.25}rem">
              {#if item.status === ItemStatus.DONE}
                <CheckCircleIcon class="mt-0.5 size-4 shrink-0 text-success" weight="fill" aria-label="Done" />
              {:else if item.status === ItemStatus.PARTIAL}
                <CircleHalfIcon class="mt-0.5 size-4 shrink-0 text-warning" weight="fill" aria-label="In progress" />
              {:else}
                <CircleIcon class="mt-0.5 size-4 shrink-0 text-foreground/40" aria-label="Planned" />
              {/if}
              <span class={cn(item.status === ItemStatus.DONE && "text-foreground/65")}>{item.text}</span>
            </li>
          {/each}
        </ul>
      </article>
    {/each}
  </div>
{:catch}
  <p class="text-ui text-error">Couldn't load the roadmap.</p>
{/await}

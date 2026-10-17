<script lang="ts">
  import { Badge } from "$lib/core/components/ui";
  import type { Snippet } from "svelte";
  import { cn } from "$lib/core/utils";
  import { format_amount, format_amounts, ingredient_list } from "./amounts";
  import type { UnitSystem } from "./constants";
  import { meta_text, type Cookware, type Recipe } from "./cooklang";
  import StepText from "./step-text.svelte";

  interface Props {
    recipe: Recipe;
    title: string;
    tags: string[];
    factor: number;
    system: UnitSystem;
    controls?: Snippet;
    class?: string;
  }

  const { recipe, title, tags, factor, system, controls, class: class_name }: Props = $props();

  const uid = $props.id();
  const ingredients = $derived(ingredient_list(recipe, factor, system));
  const cookware = $derived.by(() => {
    const seen = new Map<string, Cookware>();
    for (const section of recipe.sections)
      for (const block of section.blocks)
        if (block.kind === "step")
          for (const item of block.items) if (item.kind === "cookware" && !seen.has(item.name.toLowerCase())) seen.set(item.name.toLowerCase(), item);
    return [...seen.values()];
  });
  const details = $derived(
    [
      ["Time", meta_text(recipe, "time", "duration", "total time")],
      ["Prep", meta_text(recipe, "prep time", "prep")],
      ["Cook", meta_text(recipe, "cook time")],
      ["Source", meta_text(recipe, "source", "author")],
    ].filter((entry): entry is [string, string] => entry[1] !== null)
  );
  const description = $derived(meta_text(recipe, "description", "introduction"));
</script>

<div class="@container"><article class={cn("mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 @lg:p-6", class_name)}>
  <header class="flex flex-col gap-2">
    <h1 class="text-xl font-semibold text-balance">{title}</h1>
    {#if description}<p class="text-sm text-foreground/80">{description}</p>{/if}
    {#if details.length > 0}
      <dl class="flex flex-wrap gap-x-4 gap-y-1 text-ui">
        {#each details as [label, value] (label)}
          <div class="flex gap-1.5"><dt class="text-foreground/65">{label}</dt><dd>{value}</dd></div>
        {/each}
      </dl>
    {/if}
    {#if tags.length > 0}
      <div class="flex flex-wrap gap-1">{#each tags as tag (tag)}<Badge>{tag}</Badge>{/each}</div>
    {/if}
  </header>

  <div class="grid gap-6 @3xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
    <aside class="flex flex-col gap-4">
      {@render controls?.()}
      <section aria-labelledby={`${uid}-ingredients`} class="flex flex-col gap-1.5">
        <h2 id={`${uid}-ingredients`} class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Ingredients</h2>
        {#if ingredients.length === 0}
          <p class="text-ui text-foreground/65">Mark ingredients in the steps with @name&#123;amount%unit&#125;.</p>
        {:else}
          <ul class="flex flex-col">
            {#each ingredients as entry (`${entry.name}|${entry.optional}`)}
              <li class="flex items-baseline gap-3 border-b border-foreground/6 py-1.5 text-ui last:border-0">
                <span class="w-24 shrink-0 font-mono text-xs text-foreground/80 tabular-nums">{format_amounts(entry.amounts) || "—"}</span>
                <span class="min-w-0">
                  {entry.name}{#if entry.optional}<span class="text-foreground/65">{" (optional)"}</span>{/if}
                  {#if entry.notes.length > 0}<span class="block text-2xs text-foreground/65">{entry.notes.join("; ")}</span>{/if}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
      {#if cookware.length > 0}
        <section aria-labelledby={`${uid}-cookware`} class="flex flex-col gap-1.5">
          <h2 id={`${uid}-cookware`} class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Cookware</h2>
          <ul class="flex flex-wrap gap-1">
            {#each cookware as item (item.name)}
              <li><Badge>{item.amount ? `${format_amount(item.amount)} × ` : ""}{item.name}</Badge></li>
            {/each}
          </ul>
        </section>
      {/if}
    </aside>

    <div class="flex min-w-0 flex-col gap-5">
      {#each recipe.sections as section, section_index (section_index)}
        <section class="flex flex-col gap-3">
          {#if section.name !== null}<h2 class="text-sm font-semibold">{section.name}</h2>{/if}
          <ol class="flex flex-col gap-3">
            {#each section.blocks as block, index (index)}
              {#if block.kind === "step"}
                <li class="flex gap-3">
                  <span class="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/8 font-mono text-2xs tabular-nums">{block.number}</span>
                  <p class="min-w-0 text-sm leading-6">
                    <StepText items={block.items} {factor} {system} />
                  </p>
                </li>
              {:else}
                <li class="rounded-md bg-foreground/5 px-3 py-2 text-ui text-foreground/80 italic">{block.text}</li>
              {/if}
            {/each}
          </ol>
        </section>
      {:else}
        <p class="text-ui text-foreground/65">No steps yet. Each paragraph of the file is one step.</p>
      {/each}
    </div>
  </div>
</article></div>

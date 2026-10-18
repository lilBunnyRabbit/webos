<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import AppBadge from "$lib/core/components/apps/app-badge.svelte";
  import { Badge, Button, EmptyState } from "$lib/core/components/ui";
  import { ArrowRight as ArrowRightIcon, MagnifyingGlass as MagnifyingGlassIcon } from "phosphor-svelte";
  import { CATEGORY_ICONS } from "./category-icons";
  import { app_story, category_label, LIBRARY_CATEGORIES, LibraryCategory, type LibrarySection } from "./library";
  import ShowcaseActions from "./showcase-actions.svelte";

  interface Props {
    sections: LibrarySection[];
    counts: Record<LibraryCategory, number>;
    category: LibraryCategory;
    total: number;
    query: string;
    fresh: ReadonlySet<string>;
    updated: ReadonlySet<string>;
    onselect: (manifest: AppListing) => void;
    onclear: () => void;
  }

  let { sections, counts, category = $bindable(), total, query, fresh, updated, onselect, onclear }: Props = $props();

  const HIGHLIGHTS_ON_CARD = 2;
</script>

<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-6 pb-8 @2xl:px-8 @2xl:pt-10">
    <header class="flex flex-col gap-2">
      <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Showcase</p>
      <h2 class="text-2xl font-semibold @2xl:text-3xl">Every app, and what it solves</h2>
      <p class="max-w-2xl text-sm text-pretty text-foreground/80">
        {total} apps that run right in your browser, each one starting from a small everyday problem. Open one, or copy its solo link to
        share just that app.
      </p>
    </header>

    <div role="group" aria-label="Categories" class="-mx-4 flex gap-1 overflow-x-auto px-4 @2xl:mx-0 @2xl:flex-wrap @2xl:px-0">
      {#each LIBRARY_CATEGORIES as item (item.id)}
        {@const Icon = CATEGORY_ICONS[item.id]}
        <Button size="sm" variant="quiet" class="shrink-0" pressed={category === item.id} onclick={() => (category = item.id)}>
          <Icon weight={category === item.id ? "fill" : "regular"} />
          {item.label}
          <span class="font-mono text-2xs text-foreground/65">{counts[item.id]}</span>
        </Button>
      {/each}
    </div>

    {#if sections.length === 0}
      <EmptyState
        icon={MagnifyingGlassIcon}
        title="No apps match"
        description={query ? `Nothing called "${query}" here.` : "No app sits in this category."}
        class="py-10"
      >
        {#snippet actions()}
          <Button size="sm" onclick={onclear}>Show every app</Button>
        {/snippet}
      </EmptyState>
    {/if}

    {#each sections as section (section.id)}
      {@const Icon = CATEGORY_ICONS[section.id as LibraryCategory]}
      <section class="flex flex-col gap-3" aria-labelledby="showcase-{section.id}">
        <h3 id="showcase-{section.id}" class="flex items-center gap-2 text-sm font-semibold">
          <Icon class="size-4 text-primary" weight="duotone" />
          {section.label}
          <span class="font-mono text-2xs font-normal text-foreground/65">{section.apps.length}</span>
        </h3>
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3">
          {#each section.apps as manifest (manifest.id)}
            {@const story = app_story(manifest)}
            <li>
              <article
                class="relative flex h-full flex-col gap-3 rounded-xl bg-background-light p-4 ring-1 ring-foreground/8 transition-shadow duration-150 hover:ring-foreground/20 has-[.card-open:focus-visible]:outline-2 has-[.card-open:focus-visible]:outline-cottontail"
              >
                <div class="flex items-start gap-3">
                  <span class="relative grid size-11 shrink-0 place-items-center rounded-xl bg-background shadow-raised ring-1 ring-foreground/10">
                    <manifest.icon class="size-6" weight="duotone" />
                    <AppBadge app_id={manifest.id} />
                  </span>
                  <div class="min-w-0 flex-1">
                    <h4 class="text-base leading-tight font-semibold">
                      <button
                        type="button"
                        class="card-open text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
                        onclick={() => onselect(manifest)}
                      >
                        {manifest.name}
                      </button>
                    </h4>
                    <p class="mt-1 flex items-center gap-1.5 text-2xs text-foreground/65">
                      {category_label(manifest)}
                      {#if fresh.has(manifest.id)}<Badge tone="primary">New</Badge>{:else if updated.has(manifest.id)}<Badge tone="info">Updated</Badge>{/if}
                    </p>
                  </div>
                </div>

                {#if story.problem}
                  <p class="text-ui text-pretty text-foreground/65">{story.problem}</p>
                {/if}
                <p class="flex gap-1.5 text-ui text-pretty">
                  <ArrowRightIcon class="mt-0.5 size-3.5 shrink-0 text-primary" weight="bold" aria-hidden="true" />
                  <span>{story.solution}</span>
                </p>

                {#await manifest.highlights?.() then module}
                  {#if module?.default.length}
                    <ul class="flex flex-wrap gap-1" aria-label="Highlights">
                      {#each module.default.slice(0, HIGHLIGHTS_ON_CARD) as highlight (highlight.title)}
                        <li class="flex min-w-0 items-center gap-1 rounded-md bg-foreground/6 px-1.5 py-0.5 text-2xs">
                          <highlight.icon class="size-3 shrink-0 text-primary" weight="duotone" />
                          <span class="truncate">{highlight.title}</span>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                {/await}

                <ShowcaseActions {manifest} size="sm" class="relative mt-auto pt-1" />
              </article>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
</div>

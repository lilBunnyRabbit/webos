<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import AppBadge from "$lib/core/components/apps/app-badge.svelte";
  import AppByline from "$lib/core/components/apps/app-byline.svelte";
  import { AppIcon, Button, IconButton } from "$lib/core/components/ui";
  import { ArrowLeft as ArrowLeftIcon, ArrowRight as ArrowRightIcon, Info as InfoIcon } from "phosphor-svelte";
  import { app_story, category_label } from "./library";
  import ShowcaseActions from "./showcase-actions.svelte";

  interface Props {
    manifest: AppListing;
    onback: () => void;
    onstore: () => void;
  }

  let { manifest, onback, onstore }: Props = $props();

  const story = $derived(app_story(manifest));
</script>

<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
  <article class="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 @2xl:px-8 @2xl:pt-6">
    <div class="flex items-start gap-3">
      <IconButton label="Back to the showcase" class="-ml-1" onclick={onback}><ArrowLeftIcon weight="bold" /></IconButton>
      <span class="relative grid size-16 shrink-0 place-items-center rounded-2xl bg-background-light shadow-raised ring-1 ring-foreground/10">
        <AppIcon src={manifest.icon} class="size-9" />
        <AppBadge app_id={manifest.id} />
      </span>
      <div class="min-w-0 flex-1 pt-1">
        <h2 class="text-lg font-semibold">{manifest.name}</h2>
        <p class="text-ui text-foreground/80">{category_label(manifest)}</p>
        <AppByline {manifest} class="mt-0.5" />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <ShowcaseActions {manifest} />
      <Button variant="quiet" onclick={onstore}><InfoIcon weight="bold" /> Details</Button>
    </div>

    <div class="grid gap-3 @xl:grid-cols-2">
      {#if story.problem}
        <section class="flex flex-col gap-1.5 rounded-xl bg-background-light p-4 ring-1 ring-foreground/8">
          <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">The problem</h3>
          <p class="text-sm text-pretty">{story.problem}</p>
        </section>
      {/if}
      <section class="flex flex-col gap-1.5 rounded-xl bg-background-light p-4 ring-1 ring-primary/30">
        <h3 class="flex items-center gap-1.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">
          <ArrowRightIcon class="size-3 text-primary" weight="bold" aria-hidden="true" /> What {manifest.name} does
        </h3>
        <p class="text-sm text-pretty">{story.solution}</p>
      </section>
    </div>

    {#if manifest.preview}
      {#await manifest.preview() then image}
        <img src={image.default} alt="{manifest.name} in use" class="aspect-video w-full rounded-xl bg-background-darker object-cover ring-1 ring-foreground/8" />
      {/await}
    {/if}

    {#if manifest.description && manifest.description !== story.solution}
      <p class="text-sm text-pretty text-foreground/80">{manifest.description}</p>
    {/if}

    {#await manifest.highlights?.() then module}
      {#if module?.default.length}
        <section class="flex flex-col gap-2">
          <h3 class="text-sm font-semibold">Highlights</h3>
          <ul class="grid gap-2 @xl:grid-cols-2">
            {#each module.default as highlight (highlight.title)}
              <li class="flex gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8">
                <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                  <highlight.icon class="size-4.5" weight="duotone" />
                </span>
                <div class="min-w-0">
                  <h4 class="text-ui font-semibold">{highlight.title}</h4>
                  <p class="text-2xs text-pretty text-foreground/65">{highlight.text}</p>
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/await}
  </article>
</div>

<script lang="ts" module>
  import type { AppListing } from "$lib/core/api";

  export interface AnnouncedApp {
    manifest: AppListing;
    version: string;
  }

  export const PAGED_LIMIT = 4;
</script>

<script lang="ts">
  import kernel, { type AppHighlight, type AppsService, type DialogProps } from "$lib/core/api";
  import { APP_CATEGORY_LABELS } from "$lib/core/api/services/apps/search";
  import { cn } from "$lib/core/utils";
  import {
    ArrowSquareOut as ArrowSquareOutIcon,
    Check as CheckIcon,
    ListBullets as ListBulletsIcon,
    Sparkle as SparkleIcon,
    TerminalWindow as TerminalWindowIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import AppByline from "../apps/app-byline.svelte";
  import { Badge, Button, IconButton } from "../ui";

  interface Props extends DialogProps<true> {
    apps: AnnouncedApp[];
    /** Rendered in place (the Style Guide): takes no focus. */
    inline?: boolean;
    class?: string;
  }

  let { apps, resolve, inline = false, class: class_name }: Props = $props();

  const apps_service = $derived(kernel.service<AppsService>("apps"));

  const listed = $derived(apps.length > PAGED_LIMIT);
  let page = $state(0);
  const current = $derived(apps[Math.min(page, apps.length - 1)]);
  const last = $derived(page >= apps.length - 1);
  let opened = $state<string[]>([]);

  interface Extras {
    preview?: string;
    highlights: AppHighlight[];
  }

  // One await for every page: per-part {#await} blocks render empty for a frame, so the dialog grew after it opened.
  const extras = $derived(
    listed
      ? Promise.resolve(new Map<string, Extras>())
      : Promise.all(
          apps.map(async ({ manifest }) => {
            const [preview, highlights] = await Promise.all([manifest.preview?.(), manifest.highlights?.()]);
            return [manifest.id, { preview: preview?.default, highlights: highlights?.default ?? [] }] as const;
          })
        ).then((entries) => new Map<string, Extras>(entries))
  );

  const category = (manifest: AppListing) => (manifest.system ? "System" : APP_CATEGORY_LABELS[manifest.category]);

  function next() {
    if (last) resolve(true);
    else page++;
  }

  function open(manifest: AppListing) {
    apps_service.launch(manifest.id);
    if (listed) opened = [...opened, manifest.id];
    else next();
  }

  function go(to: number) {
    page = Math.max(0, Math.min(apps.length - 1, to));
  }

  function onkeydown(event: KeyboardEvent) {
    if (listed || apps.length < 2) return;
    if (event.key === "ArrowRight") go(page + 1);
    else if (event.key === "ArrowLeft") go(page - 1);
  }
</script>

{#snippet app_tile(manifest: AppListing, size: "lg" | "sm")}
  <span
    class={cn(
      "relative grid shrink-0 place-items-center bg-background-light shadow-raised ring-1 ring-foreground/10",
      size === "lg" ? "size-18 rounded-[1.25rem]" : "size-10 rounded-xl"
    )}
  >
    <manifest.icon class={cn("text-primary", size === "lg" ? "size-10" : "size-6")} weight="duotone" />
  </span>
{/snippet}

{#snippet glow()}
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_70%)]"
  ></div>
{/snippet}

{#snippet preview(manifest: AppListing, src: string | undefined)}
  {#if src}
    <img
      {src}
      alt="{manifest.name} in use"
      class="aspect-video w-full rounded-xl bg-background-darker object-cover ring-1 ring-foreground/8"
    />
  {/if}
{/snippet}

{#await extras then loaded}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <article
    {onkeydown}
    aria-label={listed ? `${apps.length} new apps` : `New app: ${current.manifest.name}`}
    class={cn(
      "@container relative flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[36rem] max-w-[calc(100vw-2rem)] animate-pop-in flex-col overflow-hidden rounded-2xl bg-background-lighter shadow-popover ring-1 ring-foreground/8",
      class_name
    )}
  >
    <IconButton label="Close" size="sm" class="absolute top-3 right-3 z-10" onclick={() => resolve(true)}>
      <XIcon weight="bold" />
    </IconButton>

    <div class="relative min-h-0 flex-1 overflow-y-auto">
      {@render glow()}

      {#if listed}
        <header class="relative flex flex-col items-center gap-2 px-6 pt-7 pb-5 text-center">
          <Badge tone="primary"><SparkleIcon weight="fill" /> {apps.length} new apps</Badge>
          <h2 class="text-xl font-semibold text-balance">New since your last visit</h2>
          <p class="max-w-sm text-ui text-pretty text-foreground/65">Open any of them now, or find them later in the start menu and the App Store.</p>
        </header>
        <ul class="relative flex flex-col gap-1.5 px-4 pb-4">
          {#each apps as { manifest, version }, index (manifest.id)}
            {@const done = opened.includes(manifest.id)}
            <li class="flex items-center gap-3 rounded-xl bg-background-light p-2.5 pr-3 ring-1 ring-foreground/8">
              {@render app_tile(manifest, "sm")}
              <div class="min-w-0 flex-1">
                <p class="flex items-baseline gap-2">
                  <span class="truncate text-ui font-semibold">{manifest.name}</span>
                  <span class="shrink-0 font-mono text-2xs text-foreground/65">v{version}</span>
                </p>
                <p class="line-clamp-2 text-ui text-foreground/65 @md:line-clamp-1">{manifest.description ?? category(manifest)}</p>
              </div>
              {#if done}
                <span class="flex h-7 shrink-0 items-center gap-1 px-2 text-ui text-success"><CheckIcon weight="bold" class="size-3.5" /> Opened</span>
              {:else}
                <!-- svelte-ignore a11y_autofocus -->
                <Button size="sm" class="shrink-0" autofocus={!inline && index === 0} onclick={() => open(manifest)}>Open</Button>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        {@const { manifest, version } = current}
        {@const extra = loaded.get(manifest.id)}
        {#key manifest.id}
          <div class="relative flex animate-pop-in flex-col gap-5 px-5 pt-7 pb-5 @md:px-6">
            <header class="flex flex-col items-center gap-3 text-center">
              <Badge tone="primary"><SparkleIcon weight="fill" /> New app</Badge>
              {@render app_tile(manifest, "lg")}
              <div class="flex flex-col gap-1">
                <h2 class="text-xl font-semibold text-balance">{manifest.name}</h2>
                <p class="flex items-center justify-center gap-2 text-ui text-foreground/65">
                  {category(manifest)}
                  <span aria-hidden="true" class="size-1 rounded-full bg-foreground/30"></span>
                  <span class="font-mono text-2xs">since v{version}</span>
                </p>
                <AppByline {manifest} />
              </div>
              {#if manifest.description}
                <p class="max-w-sm text-sm text-pretty text-foreground/80">{manifest.description}</p>
              {/if}
            </header>

            {@render preview(manifest, extra?.preview)}

            {#if extra?.highlights.length}
              <ul class="grid gap-2 @md:grid-cols-2">
                {#each extra.highlights as highlight (highlight.title)}
                  <li class="flex gap-3 rounded-xl bg-background-light p-3.5 ring-1 ring-foreground/8">
                    <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                      <highlight.icon class="size-4.5" weight="duotone" />
                    </span>
                    <div class="min-w-0">
                      <h3 class="text-ui font-semibold">{highlight.title}</h3>
                      <p class="text-ui text-pretty text-foreground/65">{highlight.text}</p>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}

            <div class="flex flex-col gap-1.5 rounded-xl bg-background-darker p-3 ring-1 ring-foreground/8 ring-inset @md:flex-row @md:items-center @md:justify-between">
              <p class="flex items-center gap-2 text-ui text-foreground/80">
                <ListBulletsIcon class="size-4 shrink-0 text-foreground/65" weight="duotone" />
                Start menu › {category(manifest)}
              </p>
              <p class="flex items-center gap-2 text-ui text-foreground/80">
                <TerminalWindowIcon class="size-4 shrink-0 text-foreground/65" weight="duotone" />
                <span class="font-mono text-2xs">app launch {manifest.id}</span>
              </p>
            </div>
          </div>
        {/key}
      {/if}
    </div>

    <footer class="flex items-center gap-3 border-t border-foreground/8 bg-background-light px-4 py-3 @md:px-5">
      {#if !listed && apps.length > 1}
        <div class="flex gap-1.5" role="img" aria-label="App {page + 1} of {apps.length}">
          {#each apps as { manifest }, index (manifest.id)}
            <button
              aria-label="Show {manifest.name}"
              class={cn("h-1.5 rounded-full transition-all duration-200", index === page ? "w-6 bg-primary" : "w-1.5 bg-foreground/20 hover:bg-foreground/40")}
              onclick={() => go(index)}
            ></button>
          {/each}
        </div>
      {/if}
      <div class="ml-auto flex gap-2">
        {#if listed}
          <Button variant="quiet" onclick={() => resolve(true)}>{opened.length > 0 ? "Done" : "Later"}</Button>
        {:else}
          <Button variant="quiet" onclick={next}>Later</Button>
          {#key current.manifest.id}
            <!-- svelte-ignore a11y_autofocus -->
            <Button variant="primary" autofocus={!inline} onclick={() => open(current.manifest)}>
              <ArrowSquareOutIcon weight="bold" /> Open {current.manifest.name}
            </Button>
          {/key}
        {/if}
      </div>
    </footer>
  </article>
{/await}

<script lang="ts">
  import { onMount } from "svelte";
  import kernel, { type AppHighlight, type AppMeta, type AppsService, WindowFlag, type WindowId, type WindowsService } from "$lib/core/api";
  import { AppCategory } from "$lib/core/api/services/apps/type";
  import { X as XIcon } from "phosphor-svelte";
  import { Button, IconButton, Spinner } from "../ui";
  import MarkdownView from "../markdown/markdown-view.svelte";

  let { window_id }: { window_id: WindowId } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const instance = $derived(windows.get(window_id));
  const manifest = $derived(instance?.app.manifest);

  interface Loaded {
    meta: AppMeta;
    guide: string | null;
    highlights: AppHighlight[];
  }

  // One await for all three, so the overlay doesn't grow as each part lands.
  const loaded = $derived.by(() => {
    if (!manifest) return null;
    const { id, guide, highlights } = manifest;
    return Promise.all([
      apps.meta(id).catch((): AppMeta => ({})),
      guide?.().then((module) => module.default).catch(() => null) ?? null,
      highlights?.().then((module) => module.default).catch(() => []) ?? [],
    ]).then(([meta, text, list]): Loaded => ({ meta, guide: text, highlights: list }));
  });

  let element = $state<HTMLElement | null>(null);

  function close() {
    if (instance?.flags.has(WindowFlag.GUIDE)) windows.toggle_guide(window_id);
  }

  onMount(() => {
    if (!element?.contains(element.ownerDocument.activeElement)) element?.focus({ preventScroll: true });
    return windows.add_back_handler(window_id, () => (close(), true));
  });
</script>

{#if manifest}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section
    bind:this={element}
    tabindex="-1"
    aria-label="About {manifest.name}"
    class="absolute inset-0 z-20 flex flex-col bg-background outline-none @container animate-pop-in"
    onkeydown={(event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    }}
  >
    <IconButton label="Close guide" size="sm" class="absolute top-2 right-2 z-10 pointer-coarse:size-11" onclick={close}>
      <XIcon weight="bold" />
    </IconButton>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div class="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-6 pb-4 @md:px-6">
        <header class="flex items-center gap-3 pr-10">
          <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-background-light shadow-raised ring-1 ring-foreground/10">
            <manifest.icon class="size-7 text-primary" weight="duotone" />
          </span>
          <div class="min-w-0">
            <h2 class="truncate text-lg font-semibold">{manifest.name}</h2>
            <p class="text-ui text-foreground/65">{manifest.category === AppCategory.GAMES ? "How to play" : "How to use it"}</p>
          </div>
        </header>

        {#await loaded}
          <div class="grid place-items-center py-10 animate-[pop-in_160ms_ease-out_300ms_both]"><Spinner label="Loading guide" /></div>
        {:then data}
          {#if data}
            {#if data.meta.pitch}
              <div class="flex flex-col gap-1 rounded-xl bg-background-light p-3.5 ring-1 ring-foreground/8">
                <p class="text-ui text-pretty text-foreground/65">{data.meta.pitch.problem}</p>
                <p class="text-sm text-pretty">{data.meta.pitch.solution}</p>
              </div>
            {/if}

            {#if data.guide}
              <MarkdownView source={data.guide} class="gap-3 text-sm text-pretty" />
            {:else if data.meta.description}
              <p class="text-sm text-pretty text-foreground/80">{data.meta.description}</p>
            {/if}

            {#if data.highlights.length}
              <ul class="grid gap-2 @md:grid-cols-2">
                {#each data.highlights as highlight (highlight.title)}
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
          {/if}
        {/await}
      </div>
    </div>

    <footer class="flex shrink-0 justify-end border-t border-foreground/8 bg-background-light px-4 py-2.5">
      <Button variant="primary" class="pointer-coarse:h-11" onclick={close}>Got it</Button>
    </footer>
  </section>
{/if}

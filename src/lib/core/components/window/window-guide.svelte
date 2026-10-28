<script lang="ts">
  import { onMount, untrack } from "svelte";
  import kernel, { type AppHighlight, type AppMeta, type AppsService, Platform, WindowFlag, type WindowId, type WindowsService } from "$lib/core/api";
  import { AppCategory } from "$lib/core/api/services/apps/type";
  import { cn } from "$lib/core/utils";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { Button, Grabber, Spinner } from "../ui";
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

  const app_id = $derived(manifest?.id);

  // One await for all three, so the overlay doesn't grow as each part lands. Keyed on the app id alone: a version
  // poll re-adopting the same entries would otherwise reload it, flashing the spinner and losing the scroll.
  const loaded = $derived.by(() => {
    if (!app_id) return null;
    return untrack(() => load(manifest!));
  });

  function load({ id, guide, highlights }: NonNullable<typeof manifest>): Promise<Loaded> {
    return Promise.all([
      apps.meta(id).catch((): AppMeta => ({})),
      guide?.().then((module) => module.default).catch(() => null) ?? null,
      highlights?.().then((module) => module.default).catch(() => []) ?? [],
    ]).then(([meta, text, list]): Loaded => ({ meta, guide: text, highlights: list }));
  }

  let element = $state<HTMLElement | null>(null);
  /** Like a window sheet: a card in the middle of the window, on a phone docked at the bottom where the thumb is. */
  const docked = kernel.platform === Platform.MOBILE;

  function close() {
    if (instance?.flags.has(WindowFlag.GUIDE)) windows.toggle_guide(window_id);
  }

  onMount(() => {
    if (!element?.contains(element.ownerDocument.activeElement)) element?.focus({ preventScroll: true });
  });
</script>

{#if manifest}
  <div
    class={cn("absolute inset-0 z-20 grid bg-(--overlay) backdrop-blur-[2px] @container", docked ? "items-end p-2 pt-16" : "place-items-center p-4")}
    role="presentation"
    onpointerdown={(event) => {
      if (event.target === event.currentTarget) close();
    }}
    onkeydown={(event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    }}
  >
    <div
      bind:this={element}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label="About {manifest.name}"
      class={cn(
        "relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-background-lighter shadow-popover ring-1 ring-foreground/8 outline-none",
        docked ? "animate-sheet-in" : "animate-pop-in"
      )}
      {@attach docked && swipe_dismiss({ on_dismiss: close, dismissible: true })}
    >
      {#if docked}<Grabber class="absolute inset-x-0 top-1.5" />{/if}

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div class="flex w-full flex-col gap-4 px-4 pt-5 pb-4 @md:px-5">
          <header class="flex items-center gap-3">
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
                <ul class="grid gap-2">
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

      <footer class="flex shrink-0 justify-end border-t border-foreground/8 px-4 py-2.5">
        <Button variant="primary" class="pointer-coarse:h-11" onclick={close}>Got it</Button>
      </footer>
    </div>
  </div>
{/if}

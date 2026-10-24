<script lang="ts">
  import kernel, { type DialogsService, type SettingsService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Segmented, Slider, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { resolve_token } from "$lib/core/utils";
  import {
    FolderOpen as FolderOpenIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    SquareHalf as SquareHalfIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { SwipeCompare } from "$kit/components/swipe-compare";
  import { has_files, image_files, paint } from "$kit/utils/image";
  import { changed_percent, tolerance_level } from "./compare";
  import { ImagePair, Slot } from "./pair.svelte";
  import PairAlignment from "./pair-alignment.svelte";
  import PairSlot from "./pair-slot.svelte";
  import { draw_aligned, draw_heatmap, type Rect } from "./patch";
  import type { SectionProps } from "./sections";

  const View = { WIPE: "wipe", ONION: "onion", DIFF: "diff" } as const;
  type View = (typeof View)[keyof typeof View];

  const Panel = { IMAGES: "images", ALIGN: "align", CHANGES: "changes" } as const;
  type Panel = (typeof Panel)[keyof typeof Panel];

  const PANELS = [
    { value: Panel.IMAGES, label: "Images" },
    { value: Panel.ALIGN, label: "Align" },
    { value: Panel.CHANGES, label: "Changes" },
  ];
  const VIEWS = [
    { value: View.WIPE, label: "Wipe" },
    { value: View.ONION, label: "Onion" },
    { value: View.DIFF, label: "Diff" },
  ];
  const PREVIEW_SIDE = 1600;
  const MAX_REGIONS = 80;

  const { picker, initial_paths, active }: SectionProps = $props();
  const { app_id, window_id, window: win } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const settings = $derived(kernel.service<SettingsService>("settings"));

  let root = $state<HTMLElement>();
  let dragging = $state(false);
  let view = $state<View>(View.WIPE);
  let wipe = $state(50);
  let onion = $state(50);
  let hovered = $state.raw<Rect | null>(null);
  let primary = $state<string | null>(null);
  let stage = $state<ReturnType<typeof SwipeCompare>>();
  let panel = $state<Panel>(Panel.IMAGES);

  const pair = new ImagePair({
    app_id,
    win,
    titles: { original: "Open the before image", edited: "Open the after image" },
    on_load: (slot) => {
      if (slot === Slot.EDITED) stage?.reset();
    },
    on_aligned: () => {
      if (panel === Panel.IMAGES) panel = Panel.CHANGES;
    },
  });

  const before = $derived(pair.original);
  const after = $derived(pair.edited);
  const ready = $derived(pair.ready);
  const too_many = $derived(pair.regions.length > MAX_REGIONS);
  const regions = $derived(too_many ? [] : pair.regions);
  const changed = $derived(pair.comparison ? changed_percent(pair.comparison.diff, tolerance_level(pair.tolerance), pair.covered) : null);

  const preview_scale = $derived(after ? Math.min(1, PREVIEW_SIDE / Math.max(after.bitmap.width, after.bitmap.height)) : 1);
  const aligned = $derived(ready ? draw_aligned(ready.original.bitmap, ready.edited.bitmap, ready.alignment, preview_scale) : null);
  const heatmap = $derived(view === View.DIFF && pair.comparison && primary ? draw_heatmap(pair.comparison.diff, primary) : null);

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(settings.theme);
    if (!root) return;
    const probe = root;
    const frame = requestAnimationFrame(() => (primary = resolve_token(probe, "var(--primary)")));
    return () => cancelAnimationFrame(frame);
  });

  onDestroy(() => pair.destroy());

  pair.load_paths(untrack(() => initial_paths));

  function on_paste(event: ClipboardEvent) {
    if (!active || !win.is_focused || dialogs.system.length > 0 || dialogs.for_window(window_id).length > 0) return;
    const target = event.target;
    if (target instanceof Node && target !== document.body && !root?.contains(target)) return;
    const files = image_files(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    pair.take(files);
  }

  function on_dragover(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!root?.contains(event.relatedTarget as Node | null)) dragging = false;
  }

  function on_drop(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging = false;
    pair.take(image_files(event.dataTransfer));
  }

  function signed(value: number): string {
    return value < 0 ? `−${Math.abs(value)}` : `${value}`;
  }

  function percent(value: number, total: number): string {
    return `${(value / total) * 100}%`;
  }
</script>

<svelte:document onpaste={on_paste} />

{#snippet heading(text: string)}
  <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{text}</h3>
{/snippet}

{#snippet stat(label: string, value: string)}
  <div class="flex flex-col gap-0.5 rounded-md bg-foreground/4 px-2 py-1.5">
    <dt class="text-2xs text-foreground/65">{label}</dt>
    <dd class="font-mono text-ui tabular-nums">{value}</dd>
  </div>
{/snippet}

<div
  bind:this={root}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Compare"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    {@render picker()}
    <span class="min-w-20 flex-1 truncate px-1 text-ui font-medium">{after?.name ?? before?.name ?? ""}</span>
  </Toolbar>

  {#if !before && !after && !pair.loading.original && !pair.loading.edited}
    <EmptyState
      icon={SquareHalfIcon}
      title="No images yet"
      description="Lays two versions of a picture over each other: wipe between them, fade one into the other, or see what changed. Open the before and the after, or drop both here."
    >
      {#snippet actions()}
        <Button variant="primary" onclick={() => pair.pick(Slot.ORIGINAL)}><FolderOpenIcon weight="bold" /> Open the before…</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] @2xl:grid-cols-[17rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
      <aside
        class="order-2 flex max-h-64 flex-col gap-4 overflow-auto border-t border-hairline bg-background-light p-3 @2xl:order-none @2xl:max-h-none @2xl:border-t-0 @2xl:border-r"
      >
        {#if before && after}
          <Segmented label="Settings" options={PANELS} bind:value={panel} class="sticky top-0 z-10 w-full shrink-0 *:flex-1 @2xl:hidden" />
        {/if}
        <div class={["flex flex-col gap-0.5", before && after && panel !== Panel.IMAGES && "hidden @2xl:flex"]}>
          {@render heading("Images")}
          <PairSlot {pair} slot={Slot.ORIGINAL} label="Before" />
          <PairSlot {pair} slot={Slot.EDITED} label="After" />
        </div>

        {#if before && after}
          <div class={["flex flex-col gap-2", panel !== Panel.ALIGN && "hidden @2xl:flex"]}>
            <PairAlignment {pair} rough="Rough match, check the Onion view" />
          </div>

          <div class={["flex flex-col gap-2", panel !== Panel.CHANGES && "hidden @2xl:flex"]}>
            {@render heading("Changes")}
            {#if ready && changed !== null}
              <dl class="grid grid-cols-2 gap-1.5">
                {@render stat("Changed", `${changed}%`)}
                {@render stat("Regions", too_many ? `${pair.regions.length}+` : `${regions.length}`)}
                {@render stat("Offset", `${signed(ready.alignment.dx)}, ${signed(ready.alignment.dy)}`)}
                {@render stat("Scale", `${ready.alignment.scale}`)}
              </dl>
            {/if}
            <label class="flex items-center gap-2 text-ui" title="How different a pixel must be to count as changed">
              <span class="w-20 shrink-0">Tolerance</span>
              <Slider size="sm" min={1} max={60} bind:value={pair.tolerance} class="min-w-0 flex-1" aria-label="Tolerance" />
              <span class="w-8 text-right font-mono text-2xs text-foreground/80 tabular-nums">{pair.tolerance}%</span>
            </label>
            <label class="flex items-center justify-between gap-2 text-ui" title="Ignore a colour change across the whole picture">
              Match colours
              <Switch bind:checked={pair.match_colors} />
            </label>
            {#if too_many}
              <p class="px-0.5 text-2xs text-warning">{pair.regions.length} changed spots. Raise the tolerance to see them as boxes.</p>
            {:else if !regions.length}
              <p class="px-0.5 text-2xs text-foreground/65">No changes above the tolerance.</p>
            {:else}
              <ul class="flex flex-col gap-0.5">
                {#each regions as region, index (`${region.x},${region.y},${region.width},${region.height}`)}
                  <li
                    class="flex h-8 items-center gap-2 rounded-md pl-2 pointer-coarse:h-10"
                    onpointerenter={() => (hovered = region)}
                    onpointerleave={() => (hovered = null)}
                  >
                    <span class="w-5 shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</span>
                    <span class="min-w-0 flex-1 truncate font-mono text-2xs tabular-nums">{region.width}×{region.height} at {region.x}, {region.y}</span>
                    <IconButton label="Zoom to change {index + 1}" size="sm" variant="quiet" onclick={() => stage?.focus(region)}><MagnifyingGlassIcon weight="bold" /></IconButton>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </aside>

      {#if !after || !before}
        <div class="stage grid min-h-0 place-items-center">
          {#if pair.loading.original || pair.loading.edited}
            <Spinner label="Loading image" />
          {:else}
            <EmptyState
              icon={SquareHalfIcon}
              title={before ? "Now the after image" : "Now the before image"}
              description={before ? "The version to hold up against the first." : "The version to compare against."}
            >
              {#snippet actions()}
                <Button variant="primary" onclick={() => pair.pick(before ? Slot.EDITED : Slot.ORIGINAL)}><FolderOpenIcon weight="bold" /> Open…</Button>
              {/snippet}
            </EmptyState>
          {/if}
        </div>
      {:else}
        {@const width = after.bitmap.width}
        {@const height = after.bitmap.height}
        {#snippet layers(pixelated: boolean)}
          <canvas {@attach paint(after.bitmap)} class={["block size-full", view === View.DIFF && "opacity-35", pixelated && "[image-rendering:pixelated]"]}></canvas>
          {#if aligned && view !== View.DIFF}
            <canvas
              {@attach paint(aligned)}
              class={["pointer-events-none absolute inset-0 size-full", pixelated && "[image-rendering:pixelated]"]}
              style:opacity={view === View.ONION ? onion / 100 : undefined}
            ></canvas>
          {/if}
          {#if heatmap}
            <canvas {@attach paint(heatmap)} class="pointer-events-none absolute inset-0 size-full"></canvas>
            {#each pair.uncovered as rect (`${rect.x},${rect.y}`)}
              <div
                class="hatch pointer-events-none absolute"
                style:left={percent(rect.x, width)}
                style:top={percent(rect.y, height)}
                style:width={percent(rect.width, width)}
                style:height={percent(rect.height, height)}
              ></div>
            {/each}
            {#each regions as region (`${region.x},${region.y},${region.width},${region.height}`)}
              <div
                class={["region pointer-events-none absolute", hovered === region && "hovered"]}
                style:left={percent(region.x, width)}
                style:top={percent(region.y, height)}
                style:width={percent(region.width, width)}
                style:height={percent(region.height, height)}
              ></div>
            {/each}
          {/if}
        {/snippet}
        {#snippet after_only(pixelated: boolean)}
          <canvas {@attach paint(after.bitmap)} class={["block size-full", pixelated && "[image-rendering:pixelated]"]}></canvas>
        {/snippet}
        <SwipeCompare
          bind:this={stage}
          {width}
          {height}
          left={layers}
          right={ready && aligned && view === View.WIPE ? after_only : null}
          bind:split={wipe}
          label="Preview"
          class="bg-background-darker"
        >
          {#snippet controls()}
            <Segmented size="sm" label="View" options={VIEWS} bind:value={view} />
            {#if view === View.ONION}
              <Slider size="sm" min={0} max={100} bind:value={onion} class="w-36 pointer-coarse:h-11" aria-label="Before opacity" />
            {/if}
          {/snippet}
        </SwipeCompare>
      {/if}
    </div>

    {#if after}
      <StatusBar>
        <span>{after.bitmap.width} × {after.bitmap.height} px</span>
        {#if ready && changed !== null}
          <span>{changed}% changed</span>
          <span>{too_many ? `${pair.regions.length}+` : regions.length} {regions.length === 1 ? "region" : "regions"}</span>
          <span class="ml-auto hidden truncate pointer-coarse:inline">Pinch to zoom</span>
        {/if}
      </StatusBar>
    {/if}
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop the before, then the after</span>
    </div>
  {/if}
</div>

<style>
  .stage {
    background: var(--background-darker);
  }

  .hatch {
    background: repeating-linear-gradient(
      -45deg,
      color-mix(in oklch, var(--foreground) 35%, transparent) 0 1.5px,
      color-mix(in oklch, var(--background-darkest) 45%, transparent) 1.5px 7px
    );
  }

  /* Inside the zoomed layer: divided by the zoom so outlines keep their screen size. */
  .region {
    outline: calc(1.5px / var(--zoom)) dashed var(--primary);
    outline-offset: calc(1px / var(--zoom));
  }

  .region.hovered {
    outline: calc(2.5px / var(--zoom)) solid var(--foreground);
  }
</style>

<script lang="ts">
  import { Badge, Button, EmptyState, IconButton, Segmented, Slider, Spinner, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { parent_path } from "$lib/core/api/services/files/path";
  import { error_message } from "$lib/core/utils";
  import { load_image_at, paint, type SourceImage } from "$kit/utils/image";
  import {
    ArrowLeft as ArrowLeftIcon,
    Check as CheckIcon,
    FolderOpen as FolderOpenIcon,
    Image as ImageIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { onDestroy, type Snippet } from "svelte";
  import { analyze_off_thread } from "./analysis";
  import type { Drawing } from "./file";
  import {
    bw_picture,
    colour_picture,
    downscale,
    grid_size,
    IMPORT_COLOURS,
    IMPORT_SIDE,
    is_unique,
    luminance,
    make_unique,
    otsu,
    to_oklab,
    type Lab,
    type Picture,
    type Pixels,
  } from "./from-image";
  import { INKS, type Analysis, type Verdict } from "./puzzle";

  interface Props {
    on_cancel: () => void;
    on_use: (drawing: Drawing) => void;
  }

  const { on_cancel, on_use }: Props = $props();
  const { window: win } = get_app_context();

  // Enough pixels under each of 30 cells for a fair average, without reading a full photo.
  const SAMPLE_SIDE = 360;
  const COLOUR_OPTIONS = IMPORT_COLOURS.map((count) => ({ value: String(count), label: count === 2 ? "B/W" : String(count) }));

  let root = $state<HTMLElement>();
  let source = $state.raw<SourceImage | null>(null);
  let sample = $state.raw<Pixels | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let side = $state<number>(IMPORT_SIDE.initial);
  let colours = $state("2");
  let threshold = $state<number | null>(null);
  let shown = $state<"image" | "puzzle">("puzzle");
  let attempt = $state(0);

  const size = $derived(source ? grid_size(source.bitmap.width, source.bitmap.height, side) : null);
  const averaged = $derived(sample && size ? downscale(sample, size.width, size.height) : null);
  const auto_threshold = $derived(averaged ? otsu(averaged.map(luminance)) : 127);
  const inks = $derived(root ? ink_colours(root) : []);
  const picture = $derived.by<Picture | null>(() => {
    if (!averaged || !size) return null;
    if (colours === "2") return bw_picture(averaged, size.width, size.height, threshold ?? auto_threshold);
    return colour_picture(averaged, size.width, size.height, Number(colours), inks);
  });

  interface Outcome {
    picture: Picture;
    cells: readonly number[];
    flipped: ReadonlySet<number>;
    verdict: Verdict | null;
    state: "running" | "done" | "stopped";
  }
  let outcome = $state.raw<Outcome | null>(null);
  let stop: (() => void) | null = null;

  const current = $derived(picture && outcome?.picture === picture ? outcome : null);
  const cells = $derived(current?.cells ?? picture?.cells ?? []);

  $effect(() => {
    void attempt;
    const target = picture;
    if (!target) return;
    const controller = new AbortController();
    outcome = { picture: target, cells: target.cells, flipped: new Set(), verdict: null, state: "running" };
    const timer = setTimeout(() => {
      make_unique(
        target,
        (next) => analyze(target, next, controller.signal),
        (next, flipped) => (outcome = { picture: target, cells: [...next], flipped: new Set(flipped), verdict: null, state: "running" })
      ).then(
        (result) => (outcome = { picture: target, cells: result.cells, flipped: new Set(result.flipped), verdict: result.verdict, state: "done" }),
        (reason) => controller.signal.aborted || console.warn("[Nonogram] Couldn't check the picture:", reason)
      );
    }, 250);
    stop = () => {
      clearTimeout(timer);
      controller.abort();
      if (outcome?.picture === target && outcome.state === "running") outcome = { ...outcome, state: "stopped" };
    };
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });

  function analyze(target: Picture, next: readonly number[], signal: AbortSignal): Promise<Analysis> {
    signal.throwIfAborted();
    const job = analyze_off_thread({ width: target.width, height: target.height, palette: target.palette, cells: next, budget: 4000, time_ms: 400 });
    return new Promise((resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          job.cancel();
          reject(signal.reason);
        },
        { once: true }
      );
      job.result.then(resolve, reject);
    });
  }

  /** Inks are theme tokens; a 1px canvas turns whatever colour syntax the theme uses into RGB. */
  function ink_colours(element: HTMLElement): { ink: (typeof INKS)[number]; lab: Lab }[] {
    const style = getComputedStyle(element);
    const context = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true })!;
    return INKS.map((ink) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = style.getPropertyValue(`--${ink}`).trim();
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return { ink, lab: to_oklab([r, g, b]) };
    });
  }

  function read_sample(bitmap: ImageBitmap): Pixels {
    const scale = Math.min(1, SAMPLE_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true })!;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  }

  let request = 0;

  async function load(task: () => Promise<SourceImage>) {
    const id = ++request;
    loading = true;
    error = null;
    try {
      const result = await task();
      if (id !== request) return result.bitmap.close();
      const previous = source;
      source = result;
      sample = read_sample(result.bitmap);
      threshold = null;
      previous?.bitmap.close();
    } catch (reason) {
      if (id === request) error = error_message(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  onDestroy(() => {
    stop?.();
    source?.bitmap.close();
  });

  async function pick() {
    const start_path = source?.path ? parent_path(source.path) : undefined;
    const chosen = await win.pick_file({ accept: ["image/*"], start_path, title: "Make a puzzle from an image" });
    if (chosen) load(() => load_image_at(chosen));
  }

  function use() {
    if (!picture || !source) return;
    stop?.();
    const title = source.name.replace(/\.[^.]+$/, "").slice(0, 120);
    on_use({ ...(title ? { title } : {}), width: picture.width, height: picture.height, palette: picture.palette, cells: [...cells] });
  }
</script>

{#snippet frame(width: number, height: number, label: string, content: Snippet)}
  <figure class="flex min-h-0 min-w-0 flex-col gap-2">
    <div class="grid min-h-0 flex-1 place-items-center [container-type:size]">
      <div class="relative overflow-hidden rounded-xs ring-1 ring-foreground/10" style:aspect-ratio="{width} / {height}" style:width="min(100cqw, calc(100cqh * {width / height}))">
        {@render content()}
      </div>
    </div>
    <figcaption class="truncate text-center font-mono text-2xs text-foreground/65 tabular-nums">{label}</figcaption>
  </figure>
{/snippet}

<div bind:this={root} class="grid h-full grid-rows-[auto_auto_minmax(0,1fr)_auto]" role="region" aria-label="Puzzle from an image">
  <Toolbar>
    <IconButton size="sm" label="Back to the editor" onclick={on_cancel}><ArrowLeftIcon weight="bold" /></IconButton>
    <IconButton size="sm" label="Open an image…" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">{source?.name ?? "From image"}</span>
    <Button size="sm" variant="primary" disabled={!picture || !cells.some((cell) => cell > 0)} onclick={use}>
      <CheckIcon weight="bold" class="size-3.5" />
      <span class="hidden @md:inline">Use picture</span>
      <span class="@md:hidden">Use</span>
    </Button>
  </Toolbar>

  <div class="flex min-h-9 items-center justify-center gap-2 border-b border-foreground/8 px-3 py-1.5 text-center" aria-live="polite">
    {#if !picture}
      <span class="text-ui text-foreground/65">Pick a picture; it becomes a drawing you can tweak.</span>
    {:else if !current || current.state === "running"}
      <Badge>Making it unique…</Badge>
      {#if current?.flipped.size}<span class="truncate text-ui text-foreground/80">{current.flipped.size} cells changed</span>{/if}
      <Button size="sm" variant="quiet" onclick={() => stop?.()}>Cancel</Button>
    {:else if current.state === "stopped"}
      <Badge tone="warning">Not checked</Badge>
      <Button size="sm" variant="quiet" onclick={() => attempt++}>Check again</Button>
    {:else if current.verdict && is_unique(current.verdict)}
      <Badge tone="success">Unique ✓</Badge>
      <span class="truncate text-ui text-foreground/80">{current.flipped.size ? `${current.flipped.size} cells changed to get there` : "One answer as it is"}</span>
    {:else}
      <Badge tone="error">Not unique</Badge>
      <span class="truncate text-ui text-foreground/80">Try a bigger size or fewer colours</span>
    {/if}
  </div>

  {#if loading}
    <div class="grid h-full place-items-center"><Spinner label="Loading image" /></div>
  {:else if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the image" description={error}>
      {#snippet actions()}<Button onclick={pick}><FolderOpenIcon weight="bold" /> Open another…</Button>{/snippet}
    </EmptyState>
  {:else if !source || !picture}
    <EmptyState icon={ImageIcon} title="No image yet" description="Turns a picture into a puzzle with one answer, ready to tweak in the editor.">
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open an image…</Button>{/snippet}
    </EmptyState>
  {:else}
    {@const bitmap = source.bitmap}
    <div class="stage grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 p-3 @xl:grid-cols-2 @xl:grid-rows-[minmax(0,1fr)] @xl:gap-4 @xl:p-6">
      <Segmented
        class="justify-self-center @xl:hidden"
        size="sm"
        label="Shown"
        options={[
          { value: "image", label: "Image" },
          { value: "puzzle", label: "Puzzle" },
        ]}
        bind:value={shown}
      />
      <div class={["min-h-0 grid-rows-[minmax(0,1fr)] @xl:grid", shown === "image" ? "grid" : "hidden"]}>
        {#snippet image()}<canvas {@attach paint(bitmap)} class="block size-full"></canvas>{/snippet}
        {@render frame(bitmap.width, bitmap.height, `${bitmap.width} × ${bitmap.height} px`, image)}
      </div>
      <div class={["min-h-0 grid-rows-[minmax(0,1fr)] @xl:grid", shown === "puzzle" ? "grid" : "hidden"]}>
        {#snippet grid()}
          <div class="grid size-full gap-px bg-foreground/12 p-px" style:grid-template-columns="repeat({picture.width}, minmax(0, 1fr))">
            {#each cells as cell, index (index)}
              <span class={["relative", current?.flipped.has(index) && "flipped"]} style:background={cell > 0 ? `var(--${picture.palette[cell - 1]})` : "var(--background)"}></span>
            {/each}
          </div>
        {/snippet}
        {@render frame(picture.width, picture.height, `${picture.width} × ${picture.height} cells`, grid)}
      </div>
    </div>
  {/if}

  <div class={["flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-foreground/8 px-3 py-2", picture ? "flex" : "hidden"]}>
    <label class="flex items-center gap-2 text-ui text-foreground/80">
      Size
      <Slider size="sm" class="w-28" min={IMPORT_SIDE.min} max={IMPORT_SIDE.max} step={1} bind:value={side} />
      <span class="w-6 font-mono text-2xs tabular-nums">{side}</span>
    </label>
    <Segmented size="sm" label="Colours" options={COLOUR_OPTIONS} bind:value={colours} />
    {#if colours === "2"}
      <label class="flex items-center gap-2 text-ui text-foreground/80" title="Cells at or below this brightness become ink">
        Threshold
        <Slider size="sm" class="w-28" min={0} max={255} step={1} bind:value={() => threshold ?? auto_threshold, (next) => (threshold = next ?? null)} />
        <span class="w-6 font-mono text-2xs tabular-nums">{threshold ?? auto_threshold}</span>
      </label>
      <Button size="sm" variant="quiet" disabled={threshold === null} onclick={() => (threshold = null)}>Auto</Button>
    {/if}
  </div>
</div>

<style>
  .stage {
    background: var(--background-darker);
  }

  .flipped::after {
    content: "";
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 0 1px var(--warning);
  }
</style>

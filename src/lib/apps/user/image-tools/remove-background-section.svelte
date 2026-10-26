<script lang="ts">
  import { Button, EmptyState, IconButton, Segmented, Select, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { paste_files } from "$kit/utils/paste";
  import { format_bytes, error_message } from "$lib/core/utils";
  import {
    ArrowRight as ArrowRightIcon,
    Eraser as EraserIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    Plus as PlusIcon,
    Warning as WarningIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { remove_colours } from "./remove-background";
  import { transparent_name } from "./naming";
  import type { SectionProps } from "./sections";
  import {
    FORMAT_OPTIONS,
    ImageFormat,
    extension_for,
    has_files,
    image_files,
    load_image,
    load_image_at,
    paint,
    save_image,
    type SourceImage,
  } from "$kit/utils/image";
  import { parent_path } from "$lib/core/api/services/files/path";

  // JPEG has no alpha channel, so the removed pixels would come back black.
  const APPLY_DELAY = 150;
  const FORMATS = FORMAT_OPTIONS.filter((option) => option.value !== ImageFormat.JPEG);

  const { picker, initial_paths, active }: SectionProps = $props();
  const { app_id, window: win } = get_app_context();

  let root = $state<HTMLElement>();
  let source = $state.raw<SourceImage | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let dragging = $state(false);

  let colours = $state<string[]>(["#ffffff"]);
  let format = $state<ImageFormat>(ImageFormat.PNG);
  /** A phone shows one image at a time at full size instead of two tiny ones. */
  let shown = $state<"original" | "result">("result");

  // Dragging in the colour picker fires input many times a second; the pixel pass waits until it settles.
  let applied = $state.raw<string[]>(["#ffffff"]);
  $effect(() => {
    const next = $state.snapshot(colours);
    const timer = setTimeout(() => (applied = next), APPLY_DELAY);
    return () => clearTimeout(timer);
  });

  const result = $derived(source ? remove_colours(source.bitmap, applied) : null);

  let request = 0;

  async function load(task: () => Promise<SourceImage>) {
    const id = ++request;
    loading = true;
    error = null;
    try {
      const loaded = await task();
      if (id !== request) return loaded.bitmap.close();
      const previous = source;
      source = loaded;
      previous?.bitmap.close();
    } catch (reason) {
      if (id === request) error = error_message(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  onDestroy(() => source?.bitmap.close());

  const initial = untrack(() => initial_paths[0]);
  if (initial) load(() => load_image_at(initial));

  async function pick() {
    const start_path = source?.path ? parent_path(source.path) : undefined;
    const chosen = await win.pick_file({ accept: ["image/*"], start_path, title: "Remove a background" });
    if (chosen) load(() => load_image_at(chosen));
  }

  function take(files: File[]) {
    const [file] = files;
    if (file) load(() => load_image(file));
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
    take(image_files(event.dataTransfer));
  }

  function save() {
    if (!source || !result) return;
    save_image({
      app_id,
      window: win,
      canvas: result,
      name: transparent_name(source.name, extension_for(format)),
      format,
      start_path: source.path ? parent_path(source.path) : null,
    });
  }
</script>

{#snippet panel(label: string, width: number, height: number, draw: (canvas: HTMLCanvasElement) => void)}
  <figure class="flex min-h-0 min-w-0 flex-col gap-2">
    <div class="grid min-h-0 flex-1 place-items-center [container-type:size]">
      <div
        class="checker overflow-hidden rounded-xs ring-1 ring-foreground/10"
        style:aspect-ratio="{width} / {height}"
        style:width="min(100cqw, calc(100cqh * {width / height}))"
      >
        <canvas {@attach draw} class="block size-full [image-rendering:pixelated]"></canvas>
      </div>
    </div>
    <figcaption class="truncate text-center font-mono text-2xs text-foreground/65 tabular-nums">{label} · {width} × {height} px</figcaption>
  </figure>
{/snippet}

<div
  bind:this={root}
  {@attach active && paste_files({ win, accept: ["image/*"], onfiles: (files) => take(files) })}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Remove background"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    {@render picker()}
    <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">{source?.name ?? ""}</span>
    {#if source && result && !loading && !error}
      <Select size="sm" class="w-auto" options={FORMATS} bind:value={format} aria-label="Format" />
      <Button variant="primary" size="sm" onclick={save}><FloppyDiskIcon weight="bold" /> Save…</Button>
    {/if}
  </Toolbar>

  {#if loading}
    <div class="grid h-full place-items-center"><Spinner label="Loading image" /></div>
  {:else if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the image" description={error}>
      {#snippet actions()}<Button onclick={pick}><FolderOpenIcon weight="bold" /> Open another…</Button>{/snippet}
    </EmptyState>
  {:else if !source || !result}
    <EmptyState icon={EraserIcon} title="No image open" description="Makes chosen colours transparent. Open an image, drop it here or paste it.">
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open an image…</Button>{/snippet}
    </EmptyState>
  {:else}
    <div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] @2xl:grid-cols-[15rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
      <aside class="flex max-h-44 flex-col gap-2 overflow-auto border-b border-foreground/8 bg-background-light p-3 @2xl:max-h-none @2xl:border-r @2xl:border-b-0">
        <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Colours to remove</h3>
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-1.5">
          {#each colours as colour, index (index)}
            <li class="flex items-center gap-2 rounded-lg bg-background-darker p-1 ring-1 ring-inset ring-foreground/8">
              <label class="relative size-7 pointer-coarse:size-9 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-inset ring-foreground/15" style:background={colour} title="Pick colour {index + 1}">
                <input
                  type="color"
                  class="absolute inset-0 cursor-pointer opacity-0"
                  value={colour}
                  oninput={(event) => (colours[index] = event.currentTarget.value)}
                />
              </label>
              <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80 uppercase">{colour}</span>
              <IconButton label="Remove colour" size="sm" onclick={() => colours.splice(index, 1)}><XIcon weight="bold" /></IconButton>
            </li>
          {/each}
        </ul>
        <Button size="sm" class="self-start" onclick={() => colours.push("#ffffff")}><PlusIcon weight="bold" /> Add colour</Button>
      </aside>

      <div
        class="stage grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 p-4 @xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @xl:grid-rows-[minmax(0,1fr)] @xl:gap-4 @xl:p-6"
      >
        <Segmented
          class="justify-self-center @xl:hidden"
          label="Image shown"
          options={[
            { value: "original", label: "Original" },
            { value: "result", label: "Result" },
          ]}
          bind:value={shown}
        />
        <div class={["min-h-0 grid-rows-[minmax(0,1fr)] @xl:grid", shown === "original" ? "grid" : "hidden"]}>
          {@render panel("Original", source.bitmap.width, source.bitmap.height, paint(source.bitmap))}
        </div>
        <div class="hidden place-items-center text-foreground/65 @xl:grid">
          <ArrowRightIcon class="size-5" weight="bold" />
        </div>
        <div class={["min-h-0 grid-rows-[minmax(0,1fr)] @xl:grid", shown === "result" ? "grid" : "hidden"]}>
          {@render panel("Result", result.width, result.height, paint(result))}
        </div>
      </div>
    </div>

    <StatusBar>
      <span>{source.type || "unknown type"}</span>
      <span>{format_bytes(source.size)}</span>
      <span class="ml-auto">{colours.length} {colours.length === 1 ? "colour" : "colours"}</span>
    </StatusBar>
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop to open</span>
    </div>
  {/if}
</div>

<style>
  .stage {
    background: var(--background-darker);
  }

  /* Transparent pixels are what this tool makes, so they show as a checkerboard instead of the stage colour. */
  .checker {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }
</style>

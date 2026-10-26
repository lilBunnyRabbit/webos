<script lang="ts">
  import kernel, { type FilesService, type NotificationsService } from "$lib/core/api";
  import { Badge, Button, EmptyState, IconButton, Input, Select, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { paste_files } from "$kit/utils/paste";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { error_message } from "$lib/core/utils";
  import { SwipeCompare } from "$kit/components/swipe-compare";
  import { decode } from "$kit/utils/codecs";
  import { ENCODER_INFO } from "$kit/utils/codecs/formats";
  import { read_image } from "$kit/utils/codecs/source";
  import { has_files, image_files, paint, write_image } from "$kit/utils/image";
  import { report_error } from "$kit/utils/report-error";
  import {
    ArrowsInSimple as ArrowsInSimpleIcon,
    Copy as CopyIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { z } from "zod";
  import { FIT_FORMATS, FIT_QUALITY, FitFormat, LIMIT_PRESETS, format_limit, parse_limit } from "./fit";
  import { run_fit, type FitResult } from "./fit-job";
  import { fitted_name } from "./naming";
  import type { SectionProps } from "./sections";
  import { pictures_folder } from "./test-image-job";

  const CUSTOM = "custom";
  const IMAGE_ACCEPT = ["image/*", ".jxl", ".avif"];

  const LIMITS = [
    ...LIMIT_PRESETS.map((bytes) => ({ value: String(bytes), label: format_limit(bytes) })),
    { value: CUSTOM, label: "Custom…" },
  ];
  const FORMATS = [
    { value: FitFormat.KEEP, label: "Keep" },
    { value: FitFormat.JPEG, label: "JPEG" },
    { value: FitFormat.WEBP, label: "WebP" },
    { value: FitFormat.AVIF, label: "AVIF" },
    { value: FitFormat.JXL, label: "JPEG XL" },
  ];

  interface Source {
    name: string;
    path: string | null;
    file: File;
    bitmap: ImageBitmap;
  }

  interface Shown extends FitResult {
    key: string;
    bitmap: ImageBitmap | null;
    path: string | null;
  }

  const { picker, initial_paths, active }: SectionProps = $props();
  const { app_id, window: win, storage } = get_app_context();
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const settings = storage.persisted(
    "fit",
    { limit: String(1_000_000), custom: "1.5 MB", format: FitFormat.KEEP as FitFormat, max: null as number | null },
    z.object({ limit: z.string(), custom: z.string(), format: z.enum(FIT_FORMATS), max: z.number().int().min(1).nullable() })
  );

  let root = $state<HTMLElement>();
  let source = $state.raw<Source | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let dragging = $state(false);
  let running = $state(false);
  let result = $state.raw<Shown | null>(null);
  let copied = $state(false);
  let copied_timer: ReturnType<typeof setTimeout> | undefined;

  const limit = $derived(settings.value.limit === CUSTOM ? parse_limit(settings.value.custom) : Number(settings.value.limit) || null);
  const max = $derived(typeof settings.value.max === "number" && settings.value.max >= 1 ? Math.round(settings.value.max) : null);
  const key = $derived(source ? `${source.name}|${source.file.size}|${limit}|${settings.value.format}|${max}` : "");
  const current = $derived(result?.key === key ? result : null);

  let request = 0;

  async function load(file: File, path: string | null) {
    const id = ++request;
    loading = true;
    error = null;
    try {
      const pixels = await read_image(file);
      const bitmap = await createImageBitmap(pixels);
      if (id !== request) return bitmap.close();
      replace_result(null);
      source?.bitmap.close();
      source = { name: file.name, path, file, bitmap };
    } catch (reason) {
      if (id === request) error = `Couldn't open ${file.name}: ${error_message(reason)}`;
    } finally {
      if (id === request) loading = false;
    }
  }

  async function load_at(path: string) {
    const file = await kernel.service<FilesService>("files").get_file(path);
    if (!file) {
      error = `File not found: ${path}`;
      return;
    }
    await load(file, path);
  }

  function replace_result(next: Shown | null) {
    result?.bitmap?.close();
    result = next;
  }

  onDestroy(() => {
    source?.bitmap.close();
    result?.bitmap?.close();
    clearTimeout(copied_timer);
  });

  const initial = untrack(() => initial_paths[0]);
  if (initial) load_at(initial);

  async function pick() {
    const start_path = source?.path ? parent_path(source.path) : undefined;
    const chosen = await win.pick_file({ accept: IMAGE_ACCEPT, start_path, title: "Fit an image under a size" });
    if (chosen) load_at(chosen);
  }

  function take(files: File[]) {
    const [file] = files;
    if (file) load(file, null);
  }

  async function fit() {
    if (!source || limit === null || running) return;
    const run_key = key;
    running = true;
    try {
      const fitted = await run_fit(
        app_id,
        { name: source.name, path: source.path, file: source.file },
        { limit, format: settings.value.format, max, ...FIT_QUALITY }
      );
      if (!fitted) return;
      let bitmap: ImageBitmap | null = null;
      try {
        bitmap = await createImageBitmap(fitted.copied ? source.bitmap : await decode(fitted.blob));
      } catch {
        bitmap = null;
      }
      replace_result({ ...fitted, key: run_key, bitmap, path: null });
    } finally {
      running = false;
    }
  }

  const out_name = $derived(source && current ? fitted_name(source.name, ENCODER_INFO[current.target].extension) : "");

  async function save() {
    if (!source || !current) return;
    try {
      const files = kernel.service<FilesService>("files");
      const folder = source.path ? parent_path(source.path) : await pictures_folder();
      const directory = await files.get_directory(folder);
      if (!directory) throw new Error(`${folder}: no such folder`);
      const handle = await files.create_file(directory, out_name, { content: current.blob });
      const path = `${folder === "/" ? "" : folder}/${handle.name}`;
      result = { ...current, path };
      notifications.notify(app_id, { title: "Image saved", message: path });
    } catch (reason) {
      report_error(app_id, "Couldn't save the image", reason);
    }
  }

  async function save_as() {
    if (!source || !current) return;
    const start_path = source.path ? parent_path(source.path) : "/home";
    const path = await win.pick_save({ name: out_name, accept: ["image/*"], start_path });
    if (!path) return;
    try {
      await write_image(path, current.blob);
      result = { ...current, path };
      notifications.notify(app_id, { title: "Image saved", message: path });
    } catch (reason) {
      report_error(app_id, "Couldn't save the image", reason);
    }
  }

  async function png_of(bitmap: ImageBitmap): Promise<Blob> {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    return canvas.convertToBlob({ type: "image/png" });
  }

  async function copy() {
    if (!current) return;
    const shown = current;
    try {
      const blob = shown.blob.type === "image/png" ? shown.blob : shown.bitmap ? png_of(shown.bitmap) : null;
      if (!blob) throw new Error("This format has no preview to copy");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch (reason) {
      return report_error(app_id, "Couldn't copy the image", reason);
    }
    copied = true;
    clearTimeout(copied_timer);
    copied_timer = setTimeout(() => (copied = false), 1200);
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

  function scaled_percent(shown: Shown): number {
    return Math.round((shown.width / shown.source.width) * 100);
  }
</script>

{#snippet heading(text: string)}
  <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{text}</h3>
{/snippet}

{#snippet stat(label: string, value: string)}
  <div class="flex flex-col gap-0.5 rounded-md bg-foreground/4 px-2 py-1.5">
    <dt class="text-2xs text-foreground/65">{label}</dt>
    <dd class="truncate font-mono text-ui tabular-nums">{value}</dd>
  </div>
{/snippet}

<div
  bind:this={root}
  {@attach active && paste_files({ win, accept: ["image/*"], onfiles: (files) => take(files) })}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Fit under a size"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    {@render picker()}
    <IconButton label="Open an image…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <span class="min-w-16 flex-1 truncate px-1 text-ui font-medium">{source?.name ?? ""}</span>
    {#if loading}<Spinner label="Loading image" />{/if}
    {#if source}
      <Button variant="primary" size="sm" disabled={running || limit === null} onclick={fit}><ArrowsInSimpleIcon weight="bold" /> Fit</Button>
    {/if}
  </Toolbar>

  {#if !source}
    {#if loading}
      <div class="grid h-full place-items-center"><Spinner label="Loading image" /></div>
    {:else}
      <EmptyState
        icon={ArrowsInSimpleIcon}
        title={error ?? "No image yet"}
        description="Makes a copy that fits under an upload limit, keeping as much quality as it can: it lowers the quality first and scales down only when it has to. Open an image, drop it here or paste it."
      >
        {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open an image…</Button>{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <div class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] @2xl:grid-cols-[17rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
      <aside
        class="order-2 flex max-h-72 flex-col gap-4 overflow-auto border-t border-foreground/8 bg-background-light p-3 @2xl:order-none @2xl:max-h-none @2xl:border-t-0 @2xl:border-r"
      >
        <div class="flex flex-col gap-2.5">
          {@render heading("Limit")}
          <div class="flex items-center gap-1.5">
            <Select size="sm" aria-label="Size limit" options={LIMITS} bind:value={settings.value.limit} class="min-w-0 flex-1" />
            {#if settings.value.limit === CUSTOM}
              <Input size="sm" aria-label="Custom limit" placeholder="1.5 MB" bind:value={settings.value.custom} class={["w-24 font-mono", limit === null && "ring-1 ring-error"]} />
            {/if}
          </div>
          <p class="px-0.5 text-2xs text-foreground/65">
            1 MB counts as 1,000,000 bytes, the smaller of the two readings, so it fits sites that mean 1,048,576 too.
          </p>
          <label class="flex items-center justify-between gap-2 text-ui" title="AVIF and JPEG XL are smaller at the same quality, and slow: tens of seconds on a photo">
            Format
            <Select size="sm" aria-label="Format" options={FORMATS} bind:value={settings.value.format} class="w-32" />
          </label>
          <label class="flex items-center justify-between gap-2 text-ui" title="Scales down first when the longest side is bigger">
            Max side
            <span class="flex items-center gap-1.5">
              <Input type="number" size="sm" min={1} placeholder="Any" bind:value={settings.value.max} class="w-20 font-mono tabular-nums" />
              <span class="w-6 font-mono text-2xs text-foreground/80">px</span>
            </span>
          </label>
        </div>

        {#if current}
          <div class="flex flex-col gap-2">
            {@render heading("Result")}
            <dl class="grid grid-cols-2 gap-1.5">
              {@render stat("Size", format_limit(current.blob.size))}
              {@render stat("Format", ENCODER_INFO[current.target].label)}
              {@render stat("Dimensions", `${current.width}×${current.height}`)}
              {@render stat("Quality", current.copied ? "original" : current.quality === null ? "lossless" : String(current.quality))}
            </dl>
            <p class="px-0.5 text-2xs text-foreground/65">
              {#if current.copied}
                Already under {format_limit(limit ?? 0)}: the original, unchanged.
              {:else}
                {format_limit(current.source.size)} → {format_limit(current.blob.size)}{#if current.width !== current.source.width}, scaled to {scaled_percent(current)}%{/if}, {current.attempts}
                {current.attempts === 1 ? "try" : "tries"}.
              {/if}
              {#if current.fallback}Kept as {ENCODER_INFO[current.target].label}: the original's format can't be written.{/if}
            </p>
            {#each current.warnings as warning (warning)}
              <p class="flex items-start gap-1.5 px-0.5 text-2xs text-warning"><WarningIcon weight="bold" class="mt-px size-3.5 shrink-0" />{warning}</p>
            {/each}
            <div class="flex flex-wrap gap-1.5">
              <Button size="sm" variant="primary" onclick={save} title={source.path ? "Next to the original" : "To Pictures"}><FloppyDiskIcon weight="bold" /> Save</Button>
              <Button size="sm" onclick={save_as}>Save as…</Button>
              <Button size="sm" onclick={copy} title="As PNG: the clipboard carries no other image format">
                <CopyIcon weight="bold" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            {#if current.path}
              <p class="truncate px-0.5 text-2xs text-foreground/65" title={current.path}>Saved as {base_name(current.path)}</p>
            {/if}
          </div>
        {:else if result && !running}
          <p class="px-0.5 text-2xs text-foreground/65">Settings changed. Fit again for a new result.</p>
        {/if}
      </aside>

      {#snippet original(pixelated: boolean)}
        <canvas {@attach paint(source!.bitmap)} class={["block size-full", pixelated && "[image-rendering:pixelated]"]}></canvas>
      {/snippet}
      {#snippet fitted(pixelated: boolean)}
        <canvas {@attach paint(current!.bitmap!)} class={["block size-full", pixelated && "[image-rendering:pixelated]"]}></canvas>
      {/snippet}
      <SwipeCompare
        width={source.bitmap.width}
        height={source.bitmap.height}
        left={original}
        right={current?.bitmap ? fitted : null}
        left_label="Original"
        right_label={current ? `Fitted · ${format_limit(current.blob.size)}` : undefined}
        label="Before and after"
        class="bg-background-darker"
      />
    </div>

    <StatusBar>
      <span>{source.bitmap.width} × {source.bitmap.height} px · {format_limit(source.file.size)}</span>
      {#if running}<span>Fitting…</span>{/if}
      {#if current}
        <span>→ {format_limit(current.blob.size)}</span>
        <Badge tone={current.fitted ? "success" : "warning"}>{current.fitted ? "fits" : "too big"}</Badge>
      {/if}
    </StatusBar>
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop to fit</span>
    </div>
  {/if}
</div>

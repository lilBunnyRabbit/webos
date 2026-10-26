<script lang="ts">
  import kernel, { type AppsService, type FilesService } from "$lib/core/api";
  import { Badge, Button, EmptyState, IconButton, Input, Segmented, Slider, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { paste_files } from "$kit/utils/paste";
  import { parent_path } from "$lib/core/api/services/files/path";
  import { format_bytes } from "$lib/core/utils";
  import { encode_image, has_files, image_files, load_image } from "$kit/utils/image";
  import {
    ArrowsIn as ArrowsInIcon,
    FolderOpen as FolderOpenIcon,
    FolderPlus as FolderPlusIcon,
    Plus as PlusIcon,
    Trash as TrashIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import type { SectionProps } from "./sections";
  import { DEFAULT_SQUASH, SquashFormat, estimate_bytes, format_share, saved_share, squashed_size } from "./squash";
  import { images_in, squash_images, type SquashResult } from "./squash-job";
  import { report_error } from "$kit/utils/report-error";

  const SAMPLE_SIDE = 512;

  const FORMATS = [
    { value: SquashFormat.WEBP, label: "WebP" },
    { value: SquashFormat.JPEG, label: "JPEG" },
  ];

  interface Entry {
    id: number;
    name: string;
    path: string | null;
    file: File;
    width: number;
    height: number;
    sample: OffscreenCanvas;
  }

  const { picker, initial_paths, active }: SectionProps = $props();
  const { app_id, window: win, storage } = get_app_context();

  const settings = storage.persisted(
    "squash",
    DEFAULT_SQUASH,
    z.object({
      format: z.enum([SquashFormat.WEBP, SquashFormat.JPEG]),
      quality: z.number().min(1).max(100),
      max: z.number().int().min(1).nullable(),
    })
  );

  let root = $state<HTMLElement>();
  let entries = $state.raw<Entry[]>([]);
  let loading = $state(0);
  let dragging = $state(false);
  let running = $state(false);
  let folder = $state<string | null>(null);
  /** Sample encode sizes by `id|format|quality`; the max side only rescales them. */
  let samples = $state.raw<ReadonlyMap<string, number>>(new Map());
  let results = $state.raw<ReadonlyMap<number, { key: string; result: SquashResult }>>(new Map());

  const quality = $derived(clamp_quality(settings.value.quality));
  const max = $derived(typeof settings.value.max === "number" && settings.value.max >= 1 ? Math.round(settings.value.max) : null);
  const format = $derived(settings.value.format);
  const key = $derived(`${format}|${quality}|${max}|${folder}`);

  const rows = $derived(
    entries.map((entry) => {
      const target = squashed_size(entry, max);
      const written = results.get(entry.id);
      const result = written?.key === key ? written.result : null;
      const sample = samples.get(`${entry.id}|${format}|${quality}`);
      const estimate = sample === undefined ? null : estimate_bytes(sample, entry.sample, target);
      return { entry, target, result, after: result?.size ?? estimate };
    })
  );
  const before = $derived(entries.reduce((sum, entry) => sum + entry.file.size, 0));
  const after = $derived(rows.every((row) => row.after !== null) ? rows.reduce((sum, row) => sum + row.after!, 0) : null);
  const exact = $derived(rows.every((row) => row.result !== null));
  const done = $derived(rows.filter((row) => row.result !== null).length);

  function clamp_quality(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(1, Math.round(value))) : DEFAULT_SQUASH.quality;
  }

  let next_id = 0;

  async function entry_from(file: File, path: string | null): Promise<Entry> {
    const image = await load_image(file, path);
    try {
      const { width, height } = image.bitmap;
      const size = squashed_size({ width, height }, SAMPLE_SIDE);
      const sample = new OffscreenCanvas(size.width, size.height);
      const context = sample.getContext("2d")!;
      context.imageSmoothingQuality = "high";
      context.drawImage(image.bitmap, 0, 0, size.width, size.height);
      return { id: next_id++, name: file.name, path, file, width, height, sample };
    } finally {
      image.bitmap.close();
    }
  }

  async function entry_at(path: string): Promise<Entry> {
    const file = await kernel.service<FilesService>("files").get_file(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return entry_from(file, path);
  }

  async function add(tasks: (() => Promise<Entry>)[]) {
    if (!tasks.length) return;
    loading++;
    const settled = await Promise.allSettled(tasks.map((task) => task()));
    loading--;
    const loaded = settled.flatMap((item) => (item.status === "fulfilled" ? [item.value] : []));
    if (loaded.length) entries = [...entries, ...loaded];
    for (const item of settled) {
      if (item.status === "rejected") {
        report_error(app_id, "Couldn't open the image", item.reason);
      }
    }
  }

  const initial = untrack(() => initial_paths);
  if (initial.length) add(initial.map((path) => () => entry_at(path)));

  // Estimates encode a small sample per image, one at a time; a newer pass makes an older one stop.
  let pass = 0;
  $effect(() => {
    const list = entries;
    const options = { format, quality };
    const id = ++pass;
    untrack(async () => {
      for (const entry of list) {
        const sample_key = `${entry.id}|${options.format}|${options.quality}`;
        if (samples.has(sample_key)) continue;
        const blob = await encode_image(entry.sample, options.format, options.quality / 100);
        if (id !== pass) return;
        samples = new Map(samples).set(sample_key, blob.size);
      }
    });
  });

  const start_path = $derived.by(() => {
    const path = entries.find((entry) => entry.path)?.path;
    return path ? parent_path(path) : undefined;
  });

  async function pick() {
    const chosen = await win.pick_file({ accept: ["image/*"], start_path, title: "Add to Squash", multiple: true });
    add(chosen.map((path) => () => entry_at(path)));
  }

  async function pick_folder() {
    const chosen = await win.pick_directory({ start_path, title: "Add every image in a folder" });
    if (!chosen) return;
    try {
      add((await images_in(chosen)).map((path) => () => entry_at(path)));
    } catch (error) {
      report_error(app_id, "Couldn't read the folder", error);
    }
  }

  function take(files: File[]) {
    add(files.map((file) => () => entry_from(file, null)));
  }

  function remove(id: number) {
    entries = entries.filter((entry) => entry.id !== id);
  }

  async function pick_output() {
    const chosen = await win.pick_directory({ start_path: folder ?? start_path, title: "Save squashed images to…" });
    if (chosen) folder = chosen;
  }

  async function squash() {
    const list = entries;
    const run_key = key;
    running = true;
    try {
      await squash_images({
        app_id,
        sources: list.map(({ name, path, file }) => ({ name, path, file })),
        options: { format, quality, max },
        folder,
        on_result: (index, result) => {
          results = new Map(results).set(list[index].id, { key: run_key, result });
        },
      });
    } finally {
      running = false;
    }
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
</script>

<div
  bind:this={root}
  {@attach active && paste_files({ win, accept: ["image/*"], multiple: true, onfiles: (files) => take(files) })}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Squash"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    {@render picker()}
    <IconButton label="Add images…" size="sm" onclick={pick}><PlusIcon weight="bold" /></IconButton>
    <IconButton label="Add folder…" size="sm" onclick={pick_folder}><FolderPlusIcon weight="bold" /></IconButton>
    <span class="min-w-20 flex-1 truncate px-1 text-ui font-medium">{entries.length ? `${entries.length} ${entries.length === 1 ? "image" : "images"}` : ""}</span>
    {#if loading}<Spinner label="Loading images" />{/if}
    {#if entries.length}
      <Button variant="primary" size="sm" disabled={running} onclick={squash}><ArrowsInIcon weight="bold" /> Squash</Button>
    {/if}
  </Toolbar>

  {#if !entries.length}
    {#if loading}
      <div class="grid h-full place-items-center"><Spinner label="Loading images" /></div>
    {:else}
      <EmptyState icon={ArrowsInIcon} title="No images yet" description="Saves smaller WebP or JPEG copies of many images at once. Add images or a folder, drop them here or paste them.">
        {#snippet actions()}<Button variant="primary" onclick={pick}><PlusIcon weight="bold" /> Add images…</Button><Button onclick={pick_folder}><FolderPlusIcon weight="bold" /> Add a folder…</Button>{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] @2xl:grid-cols-[16rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
      <aside class="flex max-h-56 flex-col gap-4 overflow-auto border-b border-foreground/8 bg-background-light p-3 @2xl:max-h-none @2xl:border-r @2xl:border-b-0">
        <div class="flex flex-col gap-2.5">
          <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Output</h3>
          <Segmented size="sm" label="Format" options={FORMATS} bind:value={settings.value.format} class="self-start" />
          <div class="flex flex-col gap-1">
            <label class="flex items-center justify-between gap-2 text-ui">
              Quality
              <span class="flex items-center gap-1.5">
                <Input type="number" size="sm" min={1} max={100} bind:value={settings.value.quality} class="w-16 font-mono tabular-nums" />
                <span class="w-6 font-mono text-2xs text-foreground/80">%</span>
              </span>
            </label>
            <Slider size="sm" min={1} max={100} bind:value={settings.value.quality} aria-label="Quality" />
          </div>
          <label class="flex items-center justify-between gap-2 text-ui" title="Shrinks images whose longest side is bigger; smaller ones keep their size">
            Max side
            <span class="flex items-center gap-1.5">
              <Input type="number" size="sm" min={1} placeholder="Any" bind:value={settings.value.max} class="w-16 font-mono tabular-nums" />
              <span class="w-6 font-mono text-2xs text-foreground/80">px</span>
            </span>
          </label>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Save to</h3>
          <div class="flex items-center gap-1">
            <Button size="sm" class="min-w-0 flex-1 justify-start" onclick={pick_output} title={folder ?? undefined}>
              <FolderOpenIcon weight="bold" /><span class="truncate">{folder ?? "Next to the originals"}</span>
            </Button>
            {#if folder}<IconButton label="Save next to the originals" size="sm" onclick={() => (folder = null)}><XIcon weight="bold" /></IconButton>{/if}
          </div>
          {#if !folder && entries.some((entry) => entry.path === null)}
            <p class="px-0.5 text-2xs text-foreground/65">Dropped and device images go to Pictures.</p>
          {/if}
        </div>
      </aside>

      <div class="flex min-h-0 flex-col gap-1.5 overflow-auto p-3 [container-type:inline-size]">
        <div class="flex items-center justify-between px-0.5">
          <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Images</h3>
          <IconButton label="Remove all" size="sm" disabled={running} onclick={() => (entries = [])}><TrashIcon weight="bold" /></IconButton>
        </div>
        <ol class="flex flex-col gap-0.5">
          {#each rows as { entry, target, result, after } (entry.id)}
            {@const resized = target.width !== entry.width || target.height !== entry.height}
            <li class="flex h-9 items-center gap-2 rounded-md pl-2 hover:bg-foreground/6">
              {#if result}
                <button type="button" class="min-w-0 flex-1 truncate text-left text-ui hover:underline" title="Open {result.path}" onclick={() => kernel.service<AppsService>("apps").open(result.path)}>{entry.name}</button>
              {:else}
                <span class="min-w-0 flex-1 truncate text-ui" title={entry.path ?? entry.name}>{entry.name}</span>
              {/if}
              <span class="hidden shrink-0 font-mono text-2xs text-foreground/65 tabular-nums @lg:block">
                {entry.width}×{entry.height}{#if resized} → {target.width}×{target.height}{/if}
              </span>
              <span class="hidden w-18 shrink-0 text-right font-mono text-2xs text-foreground/65 tabular-nums @sm:block">{format_bytes(entry.file.size)}</span>
              <span class="w-20 shrink-0 text-right font-mono text-2xs tabular-nums {result ? 'text-foreground' : 'text-foreground/65'}" title={result ? "Written" : "Estimate"}>
                {after === null ? "…" : `${result ? "" : "≈ "}${format_bytes(after)}`}
              </span>
              <span class="w-12 shrink-0 text-right">
                {#if after !== null}
                  {@const share = saved_share(entry.file.size, after)}
                  <Badge tone={share > 0 ? (result ? "success" : "neutral") : "warning"}>{format_share(share)}</Badge>
                {/if}
              </span>
              <IconButton label="Remove {entry.name}" size="sm" disabled={running} onclick={() => remove(entry.id)}><XIcon weight="bold" /></IconButton>
            </li>
          {/each}
        </ol>
      </div>
    </div>

    <StatusBar>
      <span>{format_bytes(before)} → {after === null ? "…" : `${exact ? "" : "≈ "}${format_bytes(after)}`}</span>
      {#if after !== null}<span>{format_share(saved_share(before, after))}</span>{/if}
      {#if done}<span class="ml-auto">{done} of {entries.length} written</span>{/if}
    </StatusBar>
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop to add</span>
    </div>
  {/if}
</div>

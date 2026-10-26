<script lang="ts">
  import kernel, { type FilesService, type NotificationsService, type TaskJob } from "$lib/core/api";
  import { Badge, Button, EmptyState, IconButton, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { paste_files } from "$kit/utils/paste";
  import { parent_path } from "$lib/core/api/services/files/path";
  import { format_bytes } from "$lib/core/utils";
  import { ENCODER_FORMATS, ENCODER_INFO, type EncoderFormat } from "$kit/utils/codecs/formats";
  import { has_files, image_files } from "$kit/utils/image";
  import { report_error } from "$kit/utils/report-error";
  import {
    FileArchive as FileArchiveIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    Swap as SwapIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { converted_name, formats_zip_name, type ConvertSource } from "./convert";
  import { convert_all, zip_cards, type ConvertCard } from "./convert-job";
  import { format_share, saved_share } from "./squash";
  import type { SectionProps } from "./sections";
  import { pictures_folder } from "./test-image-job";

  const IMAGE_ACCEPT = ["image/*", ".jxl", ".avif"];

  interface Input {
    name: string;
    path: string | null;
    file: File;
  }

  const { picker, initial_paths, active }: SectionProps = $props();
  const { app_id, window: win } = get_app_context();
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  let root = $state<HTMLElement>();
  let input = $state.raw<Input | null>(null);
  let info = $state.raw<(ConvertSource & { animated: boolean }) | null>(null);
  let cards = $state.raw<ReadonlyMap<EncoderFormat, ConvertCard>>(new Map());
  let saved = $state.raw<ReadonlyMap<EncoderFormat, string>>(new Map());
  let running = $state(false);
  let dragging = $state(false);
  let zipping = $state(false);

  const written = $derived([...cards.values()].filter((card) => card.blob));

  let request = 0;
  let job: TaskJob | null = null;
  let previous: Promise<void> = Promise.resolve();

  function take_file(file: File, path: string | null) {
    request++;
    input = { name: file.name, path, file };
    info = null;
    cards = new Map();
    saved = new Map();
    job?.cancel();
    start();
  }

  function start() {
    previous = previous.then(convert);
  }

  async function load_at(path: string) {
    const file = await kernel.service<FilesService>("files").get_file(path);
    if (!file) return report_error(app_id, "Couldn't open the image", new Error(`File not found: ${path}`));
    take_file(file, path);
  }

  const initial = untrack(() => initial_paths[0]);
  if (initial) load_at(initial);

  async function pick() {
    const start_path = input?.path ? parent_path(input.path) : undefined;
    const chosen = await win.pick_file({ accept: IMAGE_ACCEPT, start_path, title: "Convert an image to every format" });
    if (chosen) load_at(chosen);
  }

  async function convert() {
    if (!input) return;
    const id = request;
    running = true;
    try {
      await convert_all(app_id, input, {
        on_job: (next) => (job = next),
        on_source: (source) => {
          if (id === request) info = source;
        },
        on_card: (card) => {
          if (id === request) cards = new Map(cards).set(card.format, card);
        },
      });
    } finally {
      job = null;
      running = false;
    }
  }

  async function out_folder(): Promise<{ path: string; handle: FileSystemDirectoryHandle }> {
    const path = input?.path ? parent_path(input.path) : await pictures_folder();
    const handle = await kernel.service<FilesService>("files").get_directory(path);
    if (!handle) throw new Error(`${path}: no such folder`);
    return { path, handle };
  }

  async function write(name: string, content: Blob): Promise<string> {
    const folder = await out_folder();
    const handle = await kernel.service<FilesService>("files").create_file(folder.handle, name, { content });
    const path = `${folder.path === "/" ? "" : folder.path}/${handle.name}`;
    notifications.notify(app_id, { title: "Image saved", message: path });
    return path;
  }

  async function save(card: ConvertCard) {
    if (!input || !card.blob) return;
    try {
      saved = new Map(saved).set(card.format, await write(converted_name(input.name, card.format), card.blob));
    } catch (reason) {
      report_error(app_id, "Couldn't save the image", reason);
    }
  }

  async function save_zip() {
    if (!input || !written.length) return;
    zipping = true;
    try {
      await write(formats_zip_name(input.name), await zip_cards(input.name, written));
    } catch (reason) {
      report_error(app_id, "Couldn't save the zip", reason);
    } finally {
      zipping = false;
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
    const [file] = image_files(event.dataTransfer);
    if (file) take_file(file, null);
  }
</script>

<div
  bind:this={root}
  {@attach active && paste_files({ win, accept: ["image/*"], onfiles: (files) => take_file(files[0], null) })}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Convert"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    {@render picker()}
    <IconButton label="Open an image…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <span class="min-w-16 flex-1 truncate px-1 text-ui font-medium">{input?.name ?? ""}</span>
    {#if running}<Spinner label="Converting" />{/if}
    {#if input && !running && cards.size < ENCODER_FORMATS.length}
      <Button size="sm" onclick={start}><SwapIcon weight="bold" /> Convert</Button>
    {/if}
    {#if written.length}
      <Button variant="primary" size="sm" disabled={zipping || running} onclick={save_zip}><FileArchiveIcon weight="bold" /> Save all as zip</Button>
    {/if}
  </Toolbar>

  {#if !input}
    <EmptyState
      icon={SwapIcon}
      title="No image yet"
      description="Writes one image in every format WebOS can: PNG, JPEG, WebP, AVIF, JPEG XL, GIF, BMP, ICO, TIFF, QOI, TGA and PPM, with each one's size. Open an image, drop it here or paste it."
    >
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open an image…</Button>{/snippet}
    </EmptyState>
  {:else}
    <div class="flex min-h-0 flex-col gap-3 overflow-auto p-3 [container-type:inline-size]">
      {#if info?.animated}
        <p class="flex items-center gap-1.5 px-0.5 text-2xs text-warning"><WarningIcon weight="bold" class="size-3.5 shrink-0" />Animated: every format gets the first frame only.</p>
      {/if}
      <ul class="grid grid-cols-1 gap-2 @sm:grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-4">
        {#each ENCODER_FORMATS as format (format)}
          {@const card = cards.get(format)}
          {@const label = ENCODER_INFO[format].label}
          <li class="flex flex-col gap-1 rounded-lg bg-background-light px-3 py-2.5">
            <div class="flex items-center gap-2">
              <span class="text-ui font-medium">{label}</span>
              <span class="font-mono text-2xs text-foreground/65">{ENCODER_INFO[format].extension}</span>
              <span class="ml-auto"></span>
              {#if card?.blob && info}
                {@const share = saved_share(info.size, card.blob.size)}
                <Badge tone={share > 0 ? "success" : "warning"}>{format_share(share)}</Badge>
              {/if}
            </div>
            <div class="flex min-h-8 items-center gap-2">
              {#if card?.blob}
                <span class="font-mono text-ui tabular-nums">{format_bytes(card.blob.size)}</span>
                {#if saved.has(format)}<span class="truncate text-2xs text-foreground/65" title={saved.get(format)}>Saved</span>{/if}
                <Button size="sm" class="ml-auto" onclick={() => save(card)} title={input.path ? "Next to the original" : "To Pictures"}><FloppyDiskIcon weight="bold" /> Save</Button>
              {:else if card?.error}
                <span class="text-2xs text-error">{card.error}</span>
              {:else if running}
                <Spinner label="Encoding {label}" />
              {:else}
                <span class="text-2xs text-foreground/65">Not converted</span>
              {/if}
            </div>
            {#each card?.warnings ?? [] as warning (warning)}
              <span class="flex items-start gap-1.5 text-2xs text-warning"><WarningIcon weight="bold" class="mt-px size-3.5 shrink-0" />{warning}</span>
            {/each}
          </li>
        {/each}
      </ul>
    </div>

    <StatusBar>
      {#if info}<span>{info.width} × {info.height} px · {format_bytes(info.size)}</span>{/if}
      <span class="ml-auto">{written.length} of {ENCODER_FORMATS.length} formats</span>
    </StatusBar>
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop to convert</span>
    </div>
  {/if}
</div>

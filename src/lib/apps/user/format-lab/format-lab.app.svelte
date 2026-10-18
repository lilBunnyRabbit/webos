<script lang="ts">
  import kernel, {
    NotificationType,
    TaskJobStatus,
    type AppsService,
    type DialogsService,
    type FilesService,
    type NotificationsService,
    type SettingsService,
    type TaskJob,
  } from "$lib/core/api";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { Button, EmptyState, IconButton, Segmented, Select, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message, format_bytes, resolve_token } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { SSIM_STEP, SSIM_WINDOW } from "$kit/utils/codecs";
  import { CODECS, type CodecFormat } from "$kit/utils/codecs/formats";
  import { has_files, paint } from "$kit/utils/image";
  import {
    Devices as DevicesIcon,
    DownloadSimple as DownloadSimpleIcon,
    FileImage as FileImageIcon,
    FolderOpen as FolderOpenIcon,
    Lightning as LightningIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import CompareStage from "./compare-stage.svelte";
  import { write_free } from "./convert-job";
  import { run_lab, settings_key, type LabResult } from "./encode-job";
  import FormatCard from "./format-card.svelte";
  import { parse_header, type ImageHeader } from "./header";
  import HeaderPanel from "./header-panel.svelte";
  import { draw_heatmap } from "./heatmap";
  import { LAB_FORMATS, LabSettingsSchema, default_settings, type LabFormat } from "./settings";
  import { IMAGE_ACCEPT, converted_name, has_alpha, is_image, is_inspectable, read_image } from "./source";

  const View = { COMPARE: "compare", INSPECT: "inspect" } as const;
  type View = (typeof View)[keyof typeof View];
  const VIEWS = [
    { value: View.COMPARE, label: "Compare" },
    { value: View.INSPECT, label: "Inspect" },
  ];
  const SOURCE = "source";
  type Side = LabFormat | typeof SOURCE;

  interface Source {
    id: number;
    name: string;
    path: string | null;
    file: File;
    image: ImageData;
    bitmap: ImageBitmap;
    alpha: boolean;
    header: ImageHeader | null;
  }

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const theme = $derived(kernel.service<SettingsService>("settings").theme);

  const settings = storage.persisted("settings", default_settings(), LabSettingsSchema);

  let root = $state<HTMLElement>();
  let source = $state.raw<Source | null>(null);
  let loading = $state(false);
  let load_error = $state<string | null>(null);
  let dragging = $state(false);
  let view = $state<View>(View.COMPARE);
  let results = $state.raw<ReadonlyMap<LabFormat, LabResult>>(new Map());
  let errors = $state.raw<ReadonlyMap<LabFormat, string>>(new Map());
  let job = $state.raw<TaskJob | null>(null);
  let running = $state.raw<ReadonlySet<LabFormat>>(new Set());
  let left = $state<Side>(SOURCE);
  let right = $state<LabFormat>("avif");
  let split = $state(50);
  let heatmap_on = $state(false);
  let heat_color = $state<string | null>(null);

  const busy = $derived(job !== null && job.status === TaskJobStatus.RUNNING);
  const keys = $derived(Object.fromEntries(LAB_FORMATS.map((format) => [format, settings_key(settings.value[format])])) as Record<LabFormat, string>);
  const stale = $derived(LAB_FORMATS.filter((format) => results.get(format)?.key !== keys[format]));
  const current = (format: LabFormat) => {
    const result = results.get(format);
    return result && result.key === keys[format] ? result : null;
  };
  const right_result = $derived(results.get(right) ?? null);
  const left_result = $derived(left === SOURCE ? null : (results.get(left) ?? null));
  const left_bitmap = $derived(left_result?.bitmap ?? source?.bitmap);
  const side_options = $derived([
    { value: SOURCE as Side, label: "Source" },
    ...LAB_FORMATS.map((format) => ({ value: format as Side, label: CODECS[format].label })),
  ]);
  const right_options = LAB_FORMATS.map((format) => ({ value: format, label: CODECS[format].label }));

  const heatmap = $derived.by(() => {
    if (!heatmap_on || !right_result || !heat_color || !source) return null;
    const { ssim } = right_result;
    const { width, height } = source.image;
    const inset = (SSIM_WINDOW - SSIM_STEP) / 2;
    return {
      canvas: draw_heatmap(ssim, heat_color),
      box: {
        left: (inset / width) * 100,
        top: (inset / height) * 100,
        width: ((ssim.map_width * SSIM_STEP) / width) * 100,
        height: ((ssim.map_height * SSIM_STEP) / height) * 100,
      },
    };
  });

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(theme);
    if (!root) return;
    const probe = root;
    const frame = requestAnimationFrame(() => (heat_color = resolve_token(probe, "var(--error)")));
    return () => cancelAnimationFrame(frame);
  });

  onDestroy(() => {
    job?.cancel();
    release();
  });

  function report(title: string, error: unknown) {
    notifications.notify(app_id, { type: NotificationType.ERROR, title, message: error_message(error) });
  }

  function release() {
    source?.bitmap.close();
    for (const result of results.values()) result.bitmap.close();
  }

  let next_id = 0;

  async function take(file: File, path: string | null) {
    if (!is_image(file)) {
      report("Not an image", file.name);
      return;
    }
    job?.cancel();
    loading = true;
    load_error = null;
    try {
      const head = new Uint8Array(await file.slice(0, 1 << 16).arrayBuffer());
      const image = await read_image(file);
      const bitmap = await createImageBitmap(image);
      release();
      results = new Map();
      errors = new Map();
      source = { id: next_id++, name: file.name, path, file, image, bitmap, alpha: has_alpha(image), header: parse_header(head) };
      win.set_title(file.name);
      if (is_inspectable(file.name)) view = View.INSPECT;
      else {
        view = View.COMPARE;
        encode();
      }
    } catch (error) {
      load_error = error_message(error);
    } finally {
      loading = false;
    }
  }

  async function open_path(path: string) {
    try {
      const file = await files.get_file(path);
      if (!file) throw new Error(`File not found: ${path}`);
      await take(file, path);
    } catch (error) {
      load_error = error_message(error);
    }
  }

  const initial = untrack(() => initial_path);
  if (initial) open_path(initial);

  async function pick() {
    const chosen = await win.pick_file({ accept: IMAGE_ACCEPT, title: "Open in Format Lab", start_path: source?.path ? parent_path(source.path) : undefined });
    if (chosen) open_path(chosen);
  }

  async function pick_device() {
    const [file] = await pick_device_files({ accept: IMAGE_ACCEPT });
    if (file) take(file, null);
  }

  function encode(formats: readonly LabFormat[] = LAB_FORMATS) {
    const lab_source = source;
    if (!lab_source || formats.length === 0) return;
    job?.cancel();
    const chosen = formats.map((format) => ({ format, options: { ...settings.value[format] } }));
    running = new Set(formats);
    errors = new Map([...errors].filter(([format]) => !formats.includes(format)));
    const started = run_lab({
      app_id,
      name: lab_source.name,
      image: lab_source.image,
      formats: chosen,
      on_result: (result) => {
        if (source?.id !== lab_source.id) {
          result.bitmap.close();
          return;
        }
        results.get(result.format as LabFormat)?.bitmap.close();
        results = new Map(results).set(result.format as LabFormat, result);
        running = new Set([...running].filter((format) => format !== result.format));
      },
    });
    job = started;
    started.done?.finally(() => {
      if (job !== started) return;
      running = new Set();
      if (started.status === TaskJobStatus.FAILED && started.error) {
        const missing = formats.filter((format) => results.get(format)?.key !== keys[format]);
        errors = new Map([...errors, ...missing.map((format) => [format, started.error!] as const)]);
      }
    });
  }

  function show_view(next: View) {
    view = next;
    if (next === View.COMPARE && results.size === 0 && !busy) encode();
  }

  async function write(format: LabFormat, folder: string): Promise<string> {
    const result = current(format)!;
    return write_free(folder, converted_name(source!.name, format), result.blob);
  }

  function saved(paths: string[]) {
    const folder = parent_path(paths[0]);
    notifications.notify(app_id, {
      title: paths.length === 1 ? `Saved ${base_name(paths[0])}` : `Saved ${paths.length} images`,
      message: folder,
      actions: [
        ...(paths.length === 1 ? [{ label: "Open", on_click: () => void kernel.service<AppsService>("apps").open(paths[0]) }] : []),
        { label: "Show folder", on_click: () => kernel.service<AppsService>("apps").launch("file-explorer", { path: folder }) },
      ],
    });
  }

  async function save(format: LabFormat) {
    const result = current(format);
    if (!source || !result) return;
    try {
      if (source.path) {
        saved([await write(format, parent_path(source.path))]);
        return;
      }
      const name = converted_name(source.name, format);
      const chosen = await win.pick_save({ name, accept: [CODECS[format].extension], start_path: "/home/Pictures", title: `Save as ${CODECS[format].label}` });
      if (!chosen) return;
      const directory = await files.get_directory(parent_path(chosen));
      if (!directory) throw new Error(`Folder not found: ${parent_path(chosen)}`);
      await files.create_file(directory, base_name(chosen), { content: result.blob, overwrite: true });
      saved([chosen]);
    } catch (error) {
      report("Couldn't save the image", error);
    }
  }

  async function save_all() {
    if (!source) return;
    const ready = LAB_FORMATS.filter((format) => current(format));
    if (ready.length === 0) return;
    try {
      const folder = source.path
        ? parent_path(source.path)
        : await win.pick_directory({ title: `Save ${ready.length} formats to…`, start_path: "/home/Pictures" });
      if (!folder) return;
      const paths: string[] = [];
      for (const format of ready) paths.push(await write(format, folder));
      saved(paths);
    } catch (error) {
      report("Couldn't save the images", error);
    }
  }

  function accepts_input() {
    return win.is_focused && dialogs.system.length === 0 && dialogs.for_window(window_id).length === 0;
  }

  function on_paste(event: ClipboardEvent) {
    if (!accepts_input()) return;
    const target = event.target;
    if (target instanceof Node && target !== document.body && !root?.contains(target)) return;
    const file = Array.from(event.clipboardData?.files ?? []).find(is_image);
    if (!file) return;
    event.preventDefault();
    take(file, null);
  }

  function on_dragover(event: DragEvent) {
    if (!has_files(event) || dialogs.system.length > 0 || dialogs.for_window(window_id).length > 0) return;
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
    const file = Array.from(event.dataTransfer?.files ?? []).find(is_image);
    if (file) take(file, null);
  }

  const total_ms = $derived(LAB_FORMATS.reduce((sum, format) => sum + (current(format)?.ms ?? 0), 0));
  const ready_count = $derived(LAB_FORMATS.filter((format) => current(format)).length);
</script>

<svelte:document onpaste={on_paste} />

<div
  bind:this={root}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Format Lab"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    <IconButton label="Open…" size="sm" onclick={pick} class="pointer-coarse:size-11"><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Open from device…" size="sm" onclick={pick_device} class="pointer-coarse:size-11"><DevicesIcon weight="bold" /></IconButton>
    <span class="min-w-24 flex-1 truncate px-1 text-ui font-medium">{source?.name ?? ""}</span>
    {#if source}
      <Segmented size="sm" label="View" options={VIEWS} bind:value={() => view, show_view} />
      {#if view === View.COMPARE}
        <Button size="sm" variant="quiet" disabled={ready_count === 0 || busy} onclick={save_all} class="pointer-coarse:h-11">
          <DownloadSimpleIcon weight="bold" /> Save all
        </Button>
        <Button size="sm" variant="primary" disabled={busy || stale.length === 0} onclick={() => encode(stale)} class="pointer-coarse:h-11">
          <LightningIcon weight="bold" /> Encode
        </Button>
      {/if}
    {/if}
  </Toolbar>

  {#if loading}
    <div class="grid place-items-center"><Spinner label="Reading the image" /></div>
  {:else if load_error && !source}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't read the image" description={load_error}>
      {#snippet actions()}
        <Button onclick={pick}><FolderOpenIcon weight="bold" /> Open another…</Button>
      {/snippet}
    </EmptyState>
  {:else if !source}
    <EmptyState
      icon={FileImageIcon}
      title="No image yet"
      description="Open an image, drop it here or paste it. It's encoded as JPEG, WebP, AVIF and JPEG XL to compare. An AVIF or JPEG XL opens in Inspect."
    >
      {#snippet actions()}
        <Button variant="primary" onclick={pick} class="pointer-coarse:h-11"><FolderOpenIcon weight="bold" /> Open an image…</Button>
        <Button onclick={pick_device} class="pointer-coarse:h-11"><DevicesIcon weight="bold" /> From device…</Button>
      {/snippet}
    </EmptyState>
  {:else if view === View.INSPECT}
    <div class="grid min-h-0 grid-rows-[minmax(10rem,40%)_minmax(0,1fr)] @3xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] @3xl:grid-rows-1">
      <div class="stage grid min-h-0 place-items-center p-3 [container-type:size] @xl:p-6">
        <canvas
          {@attach paint(source.bitmap)}
          class="checker max-h-[100cqh] max-w-[100cqw] rounded-xs object-contain ring-1 ring-foreground/10"
          aria-label={source.name}
        ></canvas>
      </div>
      <div class="min-h-0 overflow-auto border-t border-foreground/8 @3xl:border-t-0 @3xl:border-l">
        <HeaderPanel
          name={source.name}
          size={source.file.size}
          type={source.file.type}
          width={source.image.width}
          height={source.image.height}
          alpha={source.alpha}
          header={source.header}
        />
      </div>
    </div>
  {:else}
    <div class="grid min-h-0 grid-rows-[minmax(15rem,3fr)_minmax(8rem,2fr)] @3xl:grid-cols-[minmax(0,1fr)_22rem] @3xl:grid-rows-1">
      <div class="stage grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
        <div class="flex flex-wrap items-center justify-center gap-2 px-2 pt-2 @xl:px-4 @xl:pt-3">
          <Select size="sm" options={side_options} bind:value={left} aria-label="Left side" class="w-28 pointer-coarse:h-11" />
          <span class="text-2xs text-foreground/65">vs</span>
          <Select size="sm" options={right_options} bind:value={right} aria-label="Right side" class="w-28 pointer-coarse:h-11" />
          <label class="flex min-h-7 items-center gap-2 text-ui pointer-coarse:min-h-11">
            <Switch bind:checked={heatmap_on} disabled={!right_result} />
            Heatmap
          </label>
        </div>
        {#if left_bitmap}
          <CompareStage
            left={left_bitmap}
            right={right_result?.bitmap ?? null}
            left_label={left_result ? CODECS[left_result.format].label : "Source"}
            right_label={CODECS[right].label}
            {heatmap}
            bind:split
          />
        {/if}
      </div>
      <aside class="flex min-h-0 flex-col gap-2 overflow-auto border-t border-foreground/8 bg-background p-2 @3xl:border-t-0 @3xl:border-l @xl:p-3">
        {#each LAB_FORMATS as format (format)}
          <FormatCard
            {format}
            bind:settings={settings.value[format]}
            result={results.get(format) ?? null}
            stale={stale.includes(format)}
            busy={busy && running.has(format)}
            error={errors.get(format) ?? null}
            source_size={source.file.size}
            shown={right === format}
            onshow={() => (right = format)}
            onsave={() => save(format)}
          />
        {/each}
      </aside>
    </div>
  {/if}

  <StatusBar>
    {#if source}
      <span>{source.image.width} × {source.image.height} px</span>
      <span>{format_bytes(source.file.size)}</span>
      <span class="hidden @md:inline">{source.file.type || "unknown type"}</span>
      {#if view === View.COMPARE && ready_count > 0}
        <span class="ml-auto">{ready_count} of {LAB_FORMATS.length} · {Math.round(total_ms)} ms</span>
      {/if}
    {:else}
      <span>JPEG, WebP, AVIF, JPEG XL</span>
    {/if}
  </StatusBar>

  {#if dragging}
    <div class="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-primary ring-inset"></div>
  {/if}
</div>

<style>
  .stage {
    background: var(--background-darker);
  }

  .checker {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }
</style>

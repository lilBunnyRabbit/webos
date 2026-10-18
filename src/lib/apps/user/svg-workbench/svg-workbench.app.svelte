<script lang="ts">
  import kernel, { type DialogsService, NotificationType, type FilesService, type NotificationsService } from "$lib/core/api";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import {
    Badge,
    Button,
    Checkbox,
    CopyButton,
    EmptyState,
    IconButton,
    Input,
    Segmented,
    Select,
    Separator,
    Slider,
    Spinner,
    StatusBar,
    Switch,
    Toolbar,
  } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message, format_bytes, resolve_token } from "$lib/core/utils";
  import { has_files } from "$kit/utils/image";
  import {
    ArrowsClockwise as ArrowsClockwiseIcon,
    ArrowsOut as ArrowsOutIcon,
    BezierCurve as BezierCurveIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    Plus as PlusIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { format_share, saved_share } from "$lib/apps/user/image-tools/squash";
  import { FIT, zoom_at, type Camera } from "./camera";
  import { paint_colors, svelte_component } from "./component";
  import { difference } from "./difference";
  import {
    DEFAULT_OPTIONS,
    MAX_PRECISION,
    MIN_PRECISION,
    PNG_SIZES,
    byte_size,
    component_name,
    optimize_svg,
    optimized_name,
    png_name,
    png_size,
    svg_size,
    type OptimizeOptions,
  } from "./optimize";
  import { rasterize } from "./raster";
  import { write_new, write_over } from "./shell";
  import SvgStage, { Backdrop } from "./svg-stage.svelte";

  const ACCEPT = [".svg", "image/svg+xml"];
  const DIFFERENCE_SIZE = 512;
  const MAX_PNG = 8192;

  const View = { OPTIONS: "options", COMPARE: "compare", MARKUP: "markup", PNG: "png", COMPONENT: "component" } as const;
  type View = (typeof View)[keyof typeof View];
  const TABS = [
    { value: View.COMPARE, label: "Compare" },
    { value: View.MARKUP, label: "Markup" },
    { value: View.PNG, label: "PNG" },
    { value: View.COMPONENT, label: "Component" },
  ];
  const VIEWS = [{ value: View.OPTIONS, label: "Options" }, ...TABS];

  const Mode = { SIDE: "side", DIFFERENCE: "difference" } as const;
  type Mode = (typeof Mode)[keyof typeof Mode];

  interface Source {
    name: string;
    path: string | null;
    text: string;
  }

  const props: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const options = storage.persisted<OptimizeOptions>(
    "options",
    DEFAULT_OPTIONS,
    z.object({
      precision: z.number().int().min(MIN_PRECISION).max(MAX_PRECISION),
      multipass: z.boolean(),
      keep_ids: z.boolean(),
      merge_paths: z.boolean(),
      strip_size: z.boolean(),
      strip_title: z.boolean(),
      pretty: z.boolean(),
    })
  );
  const png_sizes = storage.persisted("png-sizes", [64, 128, 256, 512], z.array(z.number().int().min(1).max(MAX_PNG)));
  const backdrop = storage.persisted<Backdrop>("backdrop", Backdrop.CHECKER, z.enum([Backdrop.CHECKER, Backdrop.LIGHT, Backdrop.DARK]));
  const view = storage.window<View>("view", View.COMPARE, z.enum([View.OPTIONS, View.COMPARE, View.MARKUP, View.PNG, View.COMPONENT]));

  let root = $state<HTMLElement>();
  let source = $state.raw<Source | null>(null);
  let loading = $state(false);
  let load_error = $state<string | null>(null);
  let dragging = $state(false);

  let output = $state.raw<string | null>(null);
  let optimize_error = $state<string | null>(null);
  let mode = $state<Mode>(Mode.SIDE);
  let camera = $state<Camera>(FIT);
  let busy = $state(false);

  const shown = $derived(view.value === View.OPTIONS ? View.COMPARE : view.value);
  const size = $derived(source ? svg_size(source.text) : null);
  const ratio = $derived(size ? size.width / size.height : 1);
  const before = $derived(source ? byte_size(source.text) : 0);
  const after = $derived(output === null ? null : byte_size(output));

  let request = 0;

  async function load(task: () => Promise<Source>) {
    const id = ++request;
    loading = true;
    load_error = null;
    try {
      const next = await task();
      if (id !== request) return;
      source = next;
      output = null;
      camera = FIT;
    } catch (reason) {
      if (id === request) load_error = error_message(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  async function read_at(path: string): Promise<Source> {
    const file = await files.get_file(path);
    if (!file) throw new Error(`${path} doesn't exist`);
    return { name: base_name(path), path, text: await file.text() };
  }

  const initial = untrack(() => props.path);
  if (initial) load(() => read_at(initial));

  async function pick() {
    const start_path = source?.path ? parent_path(source.path) : undefined;
    const chosen = await win.pick_file({ accept: ACCEPT, start_path, title: "Open an SVG" });
    if (chosen) load(() => read_at(chosen));
  }

  let optimize_run = 0;

  $effect(() => {
    const text = source?.text;
    const settings = $state.snapshot(options.value);
    if (text === undefined) return;
    const id = ++optimize_run;
    optimize_svg(text, settings).then(
      (result) => {
        if (id !== optimize_run) return;
        output = result;
        optimize_error = null;
      },
      (reason) => {
        if (id !== optimize_run) return;
        output = null;
        optimize_error = error_message(reason).split("\n")[0];
      }
    );
  });

  function url_for(text: string | null) {
    return text === null ? null : URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  }

  const original_url = $derived(url_for(source?.text ?? null));
  const output_url = $derived(url_for(output));
  const revoke_later = (url: string | null) => () => url && URL.revokeObjectURL(url);
  $effect(() => revoke_later(original_url));
  $effect(() => revoke_later(output_url));

  let diff = $state.raw<{ url: string; changed: number } | null>(null);

  function highlight(): [number, number, number] {
    const probe = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true })!;
    probe.fillStyle = root ? resolve_token(root, "var(--error)") : "red";
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  }

  $effect(() => {
    if (shown !== View.COMPARE || mode !== Mode.DIFFERENCE || !source || output === null || !size) return;
    const [text, result, target] = [source.text, output, png_size(size, DIFFERENCE_SIZE)];
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      const [a, b] = await Promise.all([rasterize(text, target), rasterize(result, target)]);
      const read = (canvas: OffscreenCanvas) => canvas.getContext("2d")!.getImageData(0, 0, target.width, target.height);
      const found = difference(read(a), read(b), highlight());
      const canvas = new OffscreenCanvas(target.width, target.height);
      canvas.getContext("2d")!.putImageData(new ImageData(found.pixels, target.width, target.height), 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      diff = { url, changed: found.changed };
    })().catch(() => !cancelled && (diff = null));
    return () => {
      cancelled = true;
      diff = null;
      if (url) URL.revokeObjectURL(url);
    };
  });

  let markup = $state.raw<string | null>(null);

  $effect(() => {
    if (shown !== View.MARKUP || !source || output === null) return;
    const settings = $state.snapshot(options.value);
    if (settings.pretty) {
      markup = output;
      return;
    }
    let cancelled = false;
    optimize_svg(source.text, { ...settings, pretty: true }).then((result) => !cancelled && (markup = result));
    return () => {
      cancelled = true;
    };
  });

  let component_size = $state(24);
  let follow_color = $state<boolean | null>(null);
  let recolor_default = $state(true);
  let component_source = $state.raw<string | null>(null);
  const recolor = $derived(follow_color ?? recolor_default);

  $effect(() => {
    if (output === null) return;
    const svg = output;
    let cancelled = false;
    paint_colors(svg).then((colors) => !cancelled && (recolor_default = colors.length <= 1));
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (shown !== View.COMPONENT || output === null) return;
    const svg = output;
    const settings = { size: Number.isFinite(component_size) && component_size > 0 ? component_size : 24, recolor };
    let cancelled = false;
    svelte_component(svg, settings).then((code) => !cancelled && (component_source = code));
    return () => {
      cancelled = true;
    };
  });

  function report(title: string, reason: unknown) {
    console.error(`[${app_id}] ${title}`, reason);
    notifications.notify(app_id, { type: NotificationType.ERROR, title, message: error_message(reason) });
  }

  const start_folder = () => (source?.path ? parent_path(source.path) : "/home");

  async function save_copy() {
    if (!source || output === null) return;
    try {
      let path: string;
      if (source.path) path = await write_new(parent_path(source.path), optimized_name(source.name), output);
      else {
        const chosen = await win.pick_save({ name: optimized_name(source.name), accept: ACCEPT, start_path: start_folder() });
        if (!chosen) return;
        await write_over(chosen, output);
        path = chosen;
      }
      notifications.notify(app_id, { title: "Optimised SVG saved", message: path });
    } catch (reason) {
      report("Couldn't save the SVG", reason);
    }
  }

  async function overwrite() {
    if (!source?.path || output === null) return;
    const confirmed = await win.confirm(`Replace “${source.name}” with the optimised SVG?`, {
      detail: "The original markup is gone after this.",
      confirm_label: "Replace",
      danger: true,
    });
    if (!confirmed || !source?.path) return;
    try {
      await write_over(source.path, output);
      source = { ...source, text: output };
      notifications.notify(app_id, { title: "SVG replaced", message: source.path ?? undefined });
    } catch (reason) {
      report("Couldn't replace the SVG", reason);
    }
  }

  const chosen_sizes = $derived([...new Set(png_sizes.value)].sort((a, b) => a - b));
  let custom_size = $state<number | null>(null);

  function toggle_size(value: number, on: boolean) {
    png_sizes.value = on ? [...png_sizes.value, value] : png_sizes.value.filter((item) => item !== value);
  }

  function add_custom() {
    if (custom_size === null || !Number.isInteger(custom_size) || custom_size < 1 || custom_size > MAX_PNG) return;
    toggle_size(custom_size, true);
    custom_size = null;
  }

  async function save_pngs() {
    if (!source || !size || !chosen_sizes.length) return;
    const svg = output ?? source.text;
    let folder = source.path ? parent_path(source.path) : null;
    folder ??= await win.pick_directory({ start_path: "/home", title: "Save PNGs into" });
    if (!folder) return;
    busy = true;
    try {
      const written: string[] = [];
      for (const value of chosen_sizes) {
        const canvas = await rasterize(svg, png_size(size, value));
        written.push(await write_new(folder, png_name(source.name, value), await canvas.convertToBlob({ type: "image/png" })));
      }
      notifications.notify(app_id, {
        title: written.length === 1 ? "PNG saved" : `${written.length} PNGs saved`,
        message: written.length === 1 ? written[0] : folder,
      });
    } catch (reason) {
      report("Couldn't save the PNGs", reason);
    } finally {
      busy = false;
    }
  }

  async function save_component() {
    if (!source || component_source === null) return;
    const chosen = await win.pick_save({ name: `${component_name(source.name)}.svelte`, accept: [".svelte"], start_path: start_folder() });
    if (!chosen) return;
    try {
      await write_over(chosen, component_source);
      notifications.notify(app_id, { title: "Component saved", message: chosen });
    } catch (reason) {
      report("Couldn't save the component", reason);
    }
  }

  function zoom_by(factor: number) {
    const next = factor === 0 ? FIT : zoom_at(camera, factor, { x: 0, y: 0 });
    camera = next.scale === 1 ? FIT : next;
  }

  function take_files(list: FileList | File[] | null | undefined) {
    const file = [...(list ?? [])].find((item) => item.type === "image/svg+xml" || /\.svg$/i.test(item.name));
    if (!file) return false;
    load(async () => ({ name: file.name, path: null, text: await file.text() }));
    return true;
  }

  function on_paste(event: ClipboardEvent) {
    if (!win.is_focused || dialogs.system.length > 0 || dialogs.for_window(window_id).length > 0) return;
    const target = event.target;
    if (target instanceof Node && target !== document.body && !root?.contains(target)) return;
    if (take_files(event.clipboardData?.files)) return event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!/<svg[\s>]/i.test(text)) return;
    event.preventDefault();
    load(async () => ({ name: "pasted.svg", path: null, text }));
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
    take_files(event.dataTransfer?.files);
  }

  const dimensions = (value: number) => {
    if (!size) return "";
    const { width, height } = png_size(size, value);
    return `${width} × ${height}`;
  };
</script>

<svelte:document onpaste={on_paste} />

{#snippet toggle(label: string, title: string, key: "multipass" | "keep_ids" | "merge_paths" | "strip_size" | "strip_title" | "pretty")}
  <label class="flex min-h-7 items-center justify-between gap-3 text-ui" {title}>
    {label}
    <Switch bind:checked={options.value[key]} />
  </label>
{/snippet}

<div
  bind:this={root}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="SVG Workbench"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <span class="min-w-20 flex-1 truncate px-1 text-ui font-medium" title={source?.path ?? undefined}>{source?.name ?? ""}</span>
    {#if source}
      <Select size="sm" aria-label="View" class="w-auto @2xl:hidden" options={VIEWS} bind:value={view.value} />
      {#if source.path}
        <IconButton label="Replace the original…" size="sm" disabled={output === null} onclick={overwrite}><ArrowsClockwiseIcon weight="bold" /></IconButton>
      {/if}
      <Button variant="primary" size="sm" disabled={output === null} onclick={save_copy}><FloppyDiskIcon weight="bold" /> Save{source.path ? "" : "…"}</Button>
    {/if}
  </Toolbar>

  {#if loading}
    <div class="grid h-full place-items-center"><Spinner label="Loading the SVG" /></div>
  {:else if load_error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the SVG" description={load_error}>
      {#snippet actions()}<Button onclick={pick}><FolderOpenIcon weight="bold" /> Open another…</Button>{/snippet}
    </EmptyState>
  {:else if !source}
    <EmptyState icon={BezierCurveIcon} title="No SVG open" description="Optimises an SVG with SVGO, exports PNGs and makes Svelte components. Open one, drop it here or paste its markup.">
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open an SVG…</Button>{/snippet}
    </EmptyState>
  {:else}
    <div class="grid min-h-0 grid-cols-[minmax(0,1fr)] @2xl:grid-cols-[15rem_minmax(0,1fr)]">
      <aside
        class={[
          "min-h-0 flex-col gap-4 overflow-auto bg-background-light p-3 @2xl:flex @2xl:border-r @2xl:border-foreground/8",
          view.value === View.OPTIONS ? "flex" : "hidden",
        ]}
      >
        <div class="flex flex-col gap-1">
          <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">SVGO</h3>
          <label class="flex items-center justify-between gap-2 text-ui" title="Decimals kept in coordinates and other numbers">
            Precision
            <Input type="number" size="sm" min={MIN_PRECISION} max={MAX_PRECISION} bind:value={options.value.precision} class="w-16 font-mono tabular-nums" />
          </label>
          <Slider size="sm" min={MIN_PRECISION} max={MAX_PRECISION} step={1} bind:value={options.value.precision} aria-label="Precision" />
        </div>
        <div class="flex flex-col gap-1.5">
          {@render toggle("Multipass", "Run the plugins again until nothing changes", "multipass")}
          {@render toggle("Merge paths", "Join neighbouring paths with the same style into one", "merge_paths")}
          {@render toggle("Keep IDs", "Leave ids as they are, for CSS, scripts or links that use them", "keep_ids")}
          {@render toggle("Remove width and height", "Keep only the viewBox, so the SVG scales to its box", "strip_size")}
          {@render toggle("Remove title", "Drop <title>, the tooltip and accessible name", "strip_title")}
          {@render toggle("Pretty output", "Indent the markup instead of one line", "pretty")}
        </div>
        <Button size="sm" class="self-start" onclick={() => (options.value = { ...DEFAULT_OPTIONS })}>Reset</Button>
      </aside>

      <div class={["min-h-0 flex-col @2xl:flex", view.value === View.OPTIONS ? "hidden" : "flex"]}>
        <div class="hidden items-center gap-2 border-b border-foreground/8 px-3 py-1.5 @2xl:flex">
          <Segmented size="sm" label="View" options={TABS} bind:value={() => shown, (next) => (view.value = next)} />
        </div>

        {#if optimize_error}
          <EmptyState icon={WarningIcon} tone="error" title="SVGO couldn't read this SVG" description={optimize_error} />
        {:else if shown === View.COMPARE}
          <div class="flex flex-wrap items-center gap-1.5 px-3 pt-2">
            <Segmented
              size="sm"
              label="Compare"
              options={[
                { value: Mode.SIDE, label: "Side by side" },
                { value: Mode.DIFFERENCE, label: "Difference" },
              ]}
              bind:value={mode}
            />
            <Segmented
              size="sm"
              label="Backdrop"
              options={[
                { value: Backdrop.CHECKER, label: "Checker" },
                { value: Backdrop.LIGHT, label: "Light" },
                { value: Backdrop.DARK, label: "Dark" },
              ]}
              bind:value={backdrop.value}
            />
            <span class="ml-auto flex items-center gap-0.5">
              <IconButton label="Zoom out" size="sm" disabled={camera.scale <= 1} onclick={() => zoom_by(1 / 1.5)}><MagnifyingGlassMinusIcon weight="bold" /></IconButton>
              <span class="w-12 text-center font-mono text-2xs text-foreground/80 tabular-nums">{Math.round(camera.scale * 100)}%</span>
              <IconButton label="Zoom in" size="sm" onclick={() => zoom_by(1.5)}><MagnifyingGlassPlusIcon weight="bold" /></IconButton>
              <IconButton label="Fit" size="sm" disabled={camera.scale === 1} onclick={() => zoom_by(0)}><ArrowsOutIcon weight="bold" /></IconButton>
            </span>
          </div>
          {#if mode === Mode.SIDE}
            <SvgStage
              panes={[
                { label: "Original", src: original_url, caption: format_bytes(before) },
                { label: "Optimised", src: output_url, caption: after === null ? "…" : format_bytes(after) },
              ]}
              {ratio}
              backdrop={backdrop.value}
              bind:camera
            />
          {:else}
            <SvgStage
              panes={[
                {
                  label: "Difference",
                  src: diff?.url ?? null,
                  caption: diff ? (diff.changed > 0 ? `${diff.changed}% of the drawing changed` : "No visible change") : "",
                },
              ]}
              {ratio}
              backdrop={backdrop.value}
              bind:camera
            />
          {/if}
        {:else if shown === View.MARKUP}
          {#if markup === null}
            <div class="grid h-full place-items-center"><Spinner label="Formatting" /></div>
          {:else}
            {#await import("./markup-diff.svelte") then { default: MarkupDiff }}
              <div class="min-h-0 flex-1"><MarkupDiff original={source.text} optimized={markup} /></div>
            {/await}
          {/if}
        {:else if shown === View.PNG}
          <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
            <div class="flex flex-col gap-1">
              <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Sizes, longest side</h3>
              <ul class="grid grid-cols-1 gap-x-4 @sm:grid-cols-2 @xl:grid-cols-3">
                {#each [...new Set([...PNG_SIZES, ...chosen_sizes])].sort((a, b) => a - b) as value (value)}
                  <li>
                    <label class="flex min-h-9 items-center gap-2.5 rounded-md px-1 text-ui hover:bg-foreground/6">
                      <Checkbox checked={chosen_sizes.includes(value)} onchange={(event) => toggle_size(value, event.currentTarget.checked)} />
                      <span class="w-12 font-mono tabular-nums">{value}</span>
                      <span class="font-mono text-2xs text-foreground/65 tabular-nums">{dimensions(value)} px</span>
                    </label>
                  </li>
                {/each}
              </ul>
            </div>
            <form
              class="flex items-center gap-1.5"
              onsubmit={(event) => {
                event.preventDefault();
                add_custom();
              }}
            >
              <Input type="number" size="sm" min={1} max={MAX_PNG} placeholder="Other size" bind:value={custom_size} class="w-28 font-mono tabular-nums" aria-label="Other size in px" />
              <Button type="submit" size="sm" disabled={custom_size === null}><PlusIcon weight="bold" /> Add</Button>
            </form>
            <Separator />
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" disabled={busy || !chosen_sizes.length} onclick={save_pngs}>
                <FloppyDiskIcon weight="bold" /> Save {chosen_sizes.length === 1 ? "1 PNG" : `${chosen_sizes.length} PNGs`}{source.path ? "" : "…"}
              </Button>
              {#if busy}<Spinner label="Saving PNGs" />{/if}
              <span class="text-2xs text-foreground/65">{source.path ? "Next to the SVG, from the optimised markup" : "From the optimised markup"}</span>
            </div>
          </div>
        {:else}
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 pt-2">
            <label class="flex items-center gap-1.5 text-ui">
              Size
              <Input type="number" size="sm" min={1} max={1024} bind:value={component_size} class="w-16 font-mono tabular-nums" />
            </label>
            <label class="flex items-center gap-2 text-ui" title="Every solid colour becomes the color prop, currentColor by default">
              Follow color
              <Switch bind:checked={() => recolor, (next) => (follow_color = next)} />
            </label>
            <span class="ml-auto flex items-center gap-1">
              <CopyButton text={component_source ?? ""} disabled={component_source === null} label="Copy component" />
              <Button size="sm" disabled={component_source === null} onclick={save_component}><FloppyDiskIcon weight="bold" /> Save…</Button>
            </span>
          </div>
          <pre class="m-3 min-h-0 flex-1 overflow-auto rounded-md bg-background-darker p-3 font-mono text-2xs leading-relaxed select-text">{component_source ?? ""}</pre>
        {/if}
      </div>
    </div>

    <StatusBar>
      {#if size}<span>{Math.round(size.width)} × {Math.round(size.height)}</span>{/if}
      <span>{format_bytes(before)} → {after === null ? "…" : format_bytes(after)}</span>
      {#if after !== null}
        {@const share = saved_share(before, after)}
        <Badge tone={share > 0 ? "success" : "warning"}>{format_share(share)}</Badge>
      {/if}
    </StatusBar>
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop to open</span>
    </div>
  {/if}
</div>

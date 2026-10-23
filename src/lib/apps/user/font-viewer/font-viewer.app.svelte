<script lang="ts">
  import kernel, { FontRole, type DialogsService, type FilesService, type NotificationsService, type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, EmptyState, IconButton, Input, Section, Select, Slider, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn, error_message, format_bytes } from "$lib/core/utils";
  import { split_collection } from "$lib/core/utils/font-collection";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    Code as CodeIcon,
    FolderOpen as FolderOpenIcon,
    TextAa as TextAaIcon,
    TextT as TextTIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { CHARACTER_GROUPS, FONT_ACCEPT, FontFormat, detect_format, empty_info, WATERFALL_SIZES, code_label, read_font, variation_settings, type FontInfo } from "./font";
  import { report_error } from "$kit/utils/report-error";

  interface LoadedFace {
    family: string;
    face: FontFace;
    info: FontInfo;
  }

  interface LoadedFont {
    name: string;
    size: number;
    /** What "Use as app font" copies: the path it was opened from, or the dropped file. */
    source: string | File;
    collection: boolean;
    faces: LoadedFace[];
  }

  const DEFAULT_SAMPLE = "The quick brown fox jumps over the lazy dog";

  const { path }: { path?: string } = $props();
  const { app_id, window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  let font = $state.raw<LoadedFont | null>(null);
  let face_index = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let sample = $state(DEFAULT_SAMPLE);
  let size = $state(48);
  let axis_values = $state<Record<string, number>>({});
  let instance = $state("");
  let dragging = $state(false);
  let root: HTMLDivElement | null = $state(null);

  const current = $derived(font ? (font.faces[face_index] ?? font.faces[0]) : null);
  const text = $derived(sample.trim() ? sample : DEFAULT_SAMPLE);
  const axes = $derived(current?.info.axes ?? []);
  const variation = $derived(variation_settings(axis_values));
  const title = $derived(font && current ? (current.info.full_name ?? [current.info.family, current.info.style].filter(Boolean).join(" ")) || font.name : null);
  const instance_options = $derived([{ value: "", label: "Custom" }, ...(current?.info.instances ?? []).map((item, index) => ({ value: String(index), label: item.name }))]);
  const face_options = $derived((font?.faces ?? []).map((item, index) => ({ value: String(index), label: item.info.style ?? `Face ${index + 1}` })));

  let load_token = 0;

  async function load_face(bytes: Uint8Array<ArrayBuffer>, name: string): Promise<LoadedFace> {
    const info = await read_font(bytes.buffer).catch((reason) => {
      console.warn("[FontViewer] couldn't read the font's tables", reason);
      return null;
    });
    const family = `font-viewer-${crypto.randomUUID()}`;
    const face = new FontFace(family, bytes);
    await face.load().catch(() => {
      throw new Error(`The browser can't read ${name} as a font.`);
    });
    return { family, face, info: info ?? empty_info(detect_format(bytes)) };
  }

  function select_face(index: number) {
    face_index = index;
    axis_values = Object.fromEntries((font?.faces[index]?.info.axes ?? []).map((axis) => [axis.tag, axis.default]));
    instance = "";
  }

  async function load(file: File, source: string | File, token = ++load_token) {
    loading = true;
    error = null;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const collection = detect_format(bytes) === FontFormat.COLLECTION;
      // The browser loads only the first face of a collection, so each face loads on its own.
      const parts = collection ? split_collection(bytes) : [bytes];
      const faces = await Promise.all(parts.map((part) => load_face(part, file.name)));
      if (token !== load_token) return;
      for (const item of faces) document.fonts.add(item.face);
      font = { name: file.name, size: file.size, source, collection, faces };
      select_face(0);
      root?.focus({ preventScroll: true });
    } catch (reason) {
      if (token !== load_token) return;
      font = null;
      error = error_message(reason);
    } finally {
      if (token === load_token) loading = false;
    }
  }

  async function open_path(target: string) {
    const token = ++load_token;
    try {
      const file = await files.get_file(target);
      if (token !== load_token) return;
      if (file) return load(file, target, token);
      font = null;
      error = `File not found: ${target}`;
    } catch (reason) {
      if (token !== load_token) return;
      font = null;
      error = error_message(reason);
    }
  }

  async function pick() {
    const chosen = await win.pick_file({ accept: FONT_ACCEPT, title: "Open in Font Viewer" });
    if (chosen) await open_path(chosen);
  }

  const initial_path = untrack(() => path);
  if (initial_path) void open_path(initial_path);

  $effect(() => {
    const loaded = font;
    if (!loaded) return;
    return () => loaded.faces.forEach((item) => document.fonts.delete(item.face));
  });

  $effect(() => win.set_title(font?.name ?? null));

  async function use_as_app_font(event: MouseEvent) {
    const loaded = font;
    if (!loaded) return;
    const box = (event.currentTarget as Element).getBoundingClientRect();
    const choice = await dialogs.menu(
      [
        { id: FontRole.SANS, label: "Use as UI font", icon: TextTIcon },
        { id: FontRole.MONO, label: "Use as code font", icon: CodeIcon },
      ],
      { anchor: { x: box.left, y: box.bottom + 4 } }
    );
    if (choice !== FontRole.SANS && choice !== FontRole.MONO) return;
    try {
      await settings.use_font(choice, loaded.source);
      const name = loaded.faces[0].info.family ?? loaded.name;
      notifications.notify(app_id, { title: `${name} is now the ${choice === FontRole.SANS ? "UI" : "code"} font`, message: "Change it in Settings › Text & interface." });
    } catch (reason) {
      report_error(app_id, "Couldn't use it as the app font", reason);
    }
  }

  function apply_instance(value: string) {
    instance = value;
    const chosen = current?.info.instances[Number(value)];
    if (value && chosen) axis_values = { ...axis_values, ...chosen.coordinates };
  }

  function reset_axes() {
    axis_values = Object.fromEntries(axes.map((axis) => [axis.tag, axis.default]));
    instance = "";
  }

  function on_drop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    const dropped = event.dataTransfer?.files[0];
    if (dropped) void load(dropped, dropped);
  }

  function on_dragover(event: DragEvent) {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    dragging = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!root?.contains(event.relatedTarget as Node | null)) dragging = false;
  }
</script>

<div
  bind:this={root}
  role="presentation"
  tabindex="-1"
  class={cn("relative h-full outline-none", dragging && "ring-2 ring-primary ring-inset")}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  {#if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the font" description={error}>
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a font…</Button>{/snippet}
    </EmptyState>
  {:else if !font}
    {#if !loading}
      <EmptyState icon={TextAaIcon} title="No font open" description="Open a TTF, OTF, TTC, WOFF or WOFF2 font to preview it. You can also drop one here.">
        {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a font…</Button>{/snippet}
      </EmptyState>
    {/if}
  {:else if current}
    <div class="grid h-full grid-rows-[auto_1fr_auto]">
      <Toolbar>
        <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
        {#if font.faces.length > 1}
          <Select size="sm" class="w-36 shrink-0" aria-label="Face" options={face_options} value={String(face_index)} onchange={(event) => select_face(Number(event.currentTarget.value))} />
        {/if}
        <Input size="sm" class="min-w-0 flex-1" placeholder={DEFAULT_SAMPLE} aria-label="Sample text" bind:value={sample} />
        <div class="flex items-center gap-2">
          <Slider size="sm" class="w-24 @md:w-36" aria-label="Size" min={8} max={160} step={1} bind:value={size} />
          <span class="w-12 font-mono text-2xs text-foreground/80 tabular-nums">{size}px</span>
        </div>
        <Button size="sm" variant="quiet" class="shrink-0" title="Use as app font" onclick={use_as_app_font}>
          <TextTIcon weight="bold" /><span class="hidden @lg:inline">Use as app font</span>
        </Button>
      </Toolbar>

      <div class="min-h-0 overflow-auto">
        <div class="mx-auto flex max-w-4xl flex-col gap-6 p-4 @md:p-6" style:font-variation-settings={variation}>
          <header class="flex flex-col gap-1">
            <h1 class="truncate text-2xl" style:font-family="'{current.family}'">{title}</h1>
            <p class="font-mono text-2xs text-foreground/65">
              {[current.info.format, current.info.style, current.info.weight && `weight ${current.info.weight}`, current.info.glyphs && `${current.info.glyphs} glyphs`, current.info.version].filter(Boolean).join(" · ")}
            </p>
            {#if current.info.designer}<p class="text-ui text-foreground/65">by {current.info.designer}</p>{/if}
          </header>

          <div class="overflow-hidden leading-tight break-words" style:font-family="'{current.family}'" style:font-size="{size}px">{text}</div>

          {#if axes.length}
            <Section title="Variable axes" description="This font is variable: every axis can be set freely.">
              {#snippet actions()}
                {#if current.info.instances.length}
                  <Select size="sm" class="w-36" aria-label="Named instance" options={instance_options} value={instance} onchange={(event) => apply_instance(event.currentTarget.value)} />
                {/if}
                <IconButton label="Reset axes" size="sm" onclick={reset_axes}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
              {/snippet}
              <div class="grid gap-x-6 gap-y-2 p-3 @lg:grid-cols-2">
                {#each axes as axis (axis.tag)}
                  <label class="grid grid-cols-[6rem_1fr_3.5rem] items-center gap-2 text-ui">
                    <span class="truncate" title={axis.tag}>{axis.name}</span>
                    <Slider
                      size="sm"
                      min={axis.min}
                      max={axis.max}
                      step={axis.max - axis.min > 10 ? 1 : 0.1}
                      value={axis_values[axis.tag] ?? axis.default}
                      oninput={(event) => {
                        axis_values[axis.tag] = Number(event.currentTarget.value);
                        instance = "";
                      }}
                    />
                    <span class="text-right font-mono text-2xs text-foreground/80 tabular-nums">{axis_values[axis.tag] ?? axis.default}</span>
                  </label>
                {/each}
              </div>
            </Section>
          {/if}

          <Section title="Waterfall">
            <div class="flex flex-col divide-y divide-hairline">
              {#each WATERFALL_SIZES as step (step)}
                <div class="flex items-baseline gap-3 px-3 py-1.5">
                  <span class="w-10 shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{step}</span>
                  <span class="min-w-0 truncate leading-normal" style:font-family="'{current.family}'" style:font-size="{step}px">{text}</span>
                </div>
              {/each}
            </div>
          </Section>

          {#each CHARACTER_GROUPS as group (group.name)}
            <Section title={group.name}>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-px p-px">
                {#each group.codepoints as code (code)}
                  {@const missing = current.info.codepoints !== null && !current.info.codepoints.has(code)}
                  <div
                    class={cn("grid aspect-square place-items-center rounded-sm text-2xl hover:bg-foreground/6", missing && "opacity-38")}
                    style:font-family="'{current.family}'"
                    title={`${code_label(code)}${missing ? " · not in this font" : ""}`}
                  >
                    {String.fromCodePoint(code)}
                  </div>
                {/each}
              </div>
            </Section>
          {/each}
        </div>
      </div>

      <StatusBar>
        <span>{font.collection ? `${FontFormat.COLLECTION} · ${font.faces.length} faces` : current.info.format}</span>
        {#if current.info.glyphs}<span>{current.info.glyphs} glyphs</span>{/if}
        {#if axes.length}<span class="hidden @sm:block">{axes.map((axis) => axis.tag).join(" ")}</span>{/if}
        <span class="ml-auto">{format_bytes(font.size)}</span>
      </StatusBar>
    </div>
  {/if}

  {#if loading}
    <div class="absolute inset-0 grid place-items-center bg-background"><Spinner label="Loading font" /></div>
  {/if}
</div>

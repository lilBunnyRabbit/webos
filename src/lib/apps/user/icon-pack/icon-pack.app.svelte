<script lang="ts">
  import kernel, { type DialogsService, type FilesService, type NotificationsService, type SettingsService } from "$lib/core/api";
  import { to_hex } from "$lib/apps/system/settings/color";
  import { parent_path } from "$lib/core/api/services/files/path";
  import { Button, EmptyState, IconButton, Input, Segmented, Slider, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message, format_bytes } from "$lib/core/utils";
  import { has_files } from "$kit/utils/image";
  import { write_at } from "$lib/core/utils/zip/files";
  import {
    AppWindow as AppWindowIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    FileZip as FileZipIcon,
    FolderOpen as FolderOpenIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import Preview from "./preview.svelte";
  import { CardFont, DEFAULT_PACK, MAX_PADDING, PackSchema, card_title, file_stem, pack_name } from "./pack";
  import { build_pack, card_style, close_source, draw_card, load_card_fonts, load_icon_source, render_icons, type IconSource } from "./render";
  import { is_svg } from "./svg";
  import { report_error } from "$kit/utils/report-error";

  const Panel = { ICON: "icon", CARD: "card" } as const;
  type Panel = (typeof Panel)[keyof typeof Panel];

  const PANELS = [
    { value: Panel.ICON, label: "Icon" },
    { value: Panel.CARD, label: "Card" },
  ];
  const FONTS = [
    { value: CardFont.SANS, label: "Sans" },
    { value: CardFont.MONO, label: "Mono" },
  ];
  const ACCEPT = ["image/*", ".svg"];

  const { path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const options = storage.persisted("options", structuredClone(DEFAULT_PACK), PackSchema);

  let root = $state<HTMLElement>();
  let source = $state.raw<IconSource | null>(null);
  let loading = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let dragging = $state(false);
  let fonts_ready = $state(false);
  let panel = $state<Panel>(Panel.ICON);

  load_card_fonts().finally(() => (fonts_ready = true));

  const icon = $derived(options.value.icon);
  const card_options = $derived(options.value.card);
  const theme_background = $derived(settings.theme.background);
  const theme_hex = $derived(to_hex([theme_background])[0]);
  const style = $derived(card_style(card_options, theme_background));
  const icons = $derived(source ? render_icons(source, icon) : null);
  const card = $derived(source && fonts_ready ? draw_card(source, card_options, style) : null);
  const title = $derived(source ? card_title(card_options, source.name) : "");

  let request = 0;

  async function load(task: () => Promise<IconSource>) {
    const id = ++request;
    loading = true;
    error = null;
    try {
      const result = await task();
      if (id !== request) return close_source(result);
      const previous = source;
      source = result;
      if (previous) close_source(previous);
    } catch (reason) {
      if (id === request) error = error_message(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  async function load_at(target: string): Promise<IconSource> {
    const file = await kernel.service<FilesService>("files").get_file(target);
    if (!file) throw new Error(`File not found: ${target}`);
    return load_icon_source(file, target);
  }

  onDestroy(() => {
    if (source) close_source(source);
  });

  const initial = untrack(() => path);
  if (initial) load(() => load_at(initial));

  const start_path = $derived(source?.path ? parent_path(source.path) : undefined);

  async function pick() {
    const chosen = await win.pick_file({ accept: ACCEPT, start_path, title: "Make icons from" });
    if (chosen) load(() => load_at(chosen));
  }

  function take(files: File[]) {
    const file = files.find((item) => item.type.startsWith("image/") || is_svg(item));
    if (file) load(() => load_icon_source(file));
  }

  async function save() {
    if (!source) return;
    const target = await win.pick_save({ name: pack_name(source.name), accept: [".zip"], start_path: start_path ?? "/home", title: "Save icon pack as" });
    if (!target) return;
    saving = true;
    try {
      await write_at(target, await build_pack(source, $state.snapshot(options.value), style));
      notifications.notify(app_id, { title: "Icon pack saved", message: target });
    } catch (reason) {
      console.error(`[${app_id}] Couldn't save the icon pack`, reason);
      report_error(app_id, "Couldn't save the icon pack", reason);
    } finally {
      saving = false;
    }
  }

  function on_paste(event: ClipboardEvent) {
    if (!win.is_focused || dialogs.system.length > 0 || dialogs.for_window(window_id).length > 0) return;
    const target = event.target;
    if (target instanceof Node && target !== document.body && !root?.contains(target)) return;
    if (target instanceof HTMLInputElement) return;
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    take(files);
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
    take(Array.from(event.dataTransfer?.files ?? []));
  }
</script>

<svelte:document onpaste={on_paste} />

{#snippet heading(label: string)}
  <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{label}</h3>
{/snippet}

{#snippet percent(label: string, value: number, max: number, set: (value: number) => void, hint: string)}
  <label class="flex items-center gap-2 text-ui" title={hint}>
    <span class="w-24 shrink-0">{label}</span>
    <Slider size="sm" min={0} {max} bind:value={() => value, set} class="min-w-0 flex-1" aria-label={label} />
    <span class="w-9 text-right font-mono text-2xs text-foreground/80 tabular-nums">{value}%</span>
  </label>
{/snippet}

{#snippet swatch(label: string, value: string, set: (value: string) => void)}
  <label class="relative size-8 shrink-0 cursor-pointer pointer-coarse:size-10 overflow-hidden rounded-md ring-1 ring-foreground/15 ring-inset" style:background={value} title={label}>
    <input type="color" class="absolute inset-0 cursor-pointer opacity-0" aria-label={label} {value} oninput={(event) => set(event.currentTarget.value)} />
  </label>
{/snippet}

<div
  bind:this={root}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Icon Pack"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <span class="min-w-16 flex-1 truncate px-1 text-ui font-medium">{source?.name ?? ""}</span>
    {#if source && !loading && !error}
      <Button variant="primary" size="sm" disabled={saving} onclick={save}><FileZipIcon weight="bold" /> Save pack…</Button>
    {/if}
  </Toolbar>

  {#if loading}
    <div class="grid h-full place-items-center"><Spinner label="Loading image" /></div>
  {:else if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the image" description={error}>
      {#snippet actions()}<Button onclick={pick}><FolderOpenIcon weight="bold" /> Open another…</Button>{/snippet}
    </EmptyState>
  {:else if !source || !icons}
    <EmptyState
      icon={AppWindowIcon}
      title="No icon open"
      description="Makes favicons, app icons and a social card from an SVG or a big image, and zips them with the manifest and head tags. Open one, drop it here or paste it."
    >
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open an SVG or image…</Button>{/snippet}
    </EmptyState>
  {:else}
    <div class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] @2xl:grid-cols-[17rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
      <aside
        class="order-2 flex max-h-64 flex-col gap-4 overflow-auto border-t border-foreground/8 bg-background-light p-3 @2xl:order-none @2xl:max-h-none @2xl:border-t-0 @2xl:border-r"
      >
        <Segmented label="Settings" options={PANELS} bind:value={panel} class="sticky top-0 z-10 w-full shrink-0 *:flex-1 @2xl:hidden" />

        <div class={["flex flex-col gap-2.5", panel !== Panel.ICON && "hidden @2xl:flex"]}>
          {@render heading("Icon")}
          <div class="flex items-center gap-2 text-ui">
            <span class="w-24 shrink-0">Background</span>
            {@render swatch("Background colour", icon.background, (value) => (options.value.icon.background = value))}
            <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80 uppercase">{icon.background}</span>
          </div>
          <label class="flex items-center justify-between gap-2 text-ui" title="Favicons and PWA icons only: Apple and maskable icons need a solid background, so they keep the colour">
            Transparent
            <Switch bind:checked={options.value.icon.transparent} />
          </label>
          {@render percent("Padding", icon.padding, MAX_PADDING, (value) => (options.value.icon.padding = value), "Space around the icon on every side")}
          {@render percent(
            "Maskable",
            icon.maskable_padding,
            MAX_PADDING,
            (value) => (options.value.icon.maskable_padding = value),
            "Padding of the maskable icon, which Android crops to its own shape. About 20% keeps a square logo inside the safe zone"
          )}
          {@render percent("Corners", icon.radius, 50, (value) => (options.value.icon.radius = value), "Preview only: rounds the installed app and rounded Android icons")}
          <label class="flex items-center justify-between gap-2 text-ui">
            Show safe zone
            <Switch bind:checked={options.value.icon.safe_zone} />
          </label>
        </div>

        <div class={["flex flex-col gap-2.5", panel !== Panel.CARD && "hidden @2xl:flex"]}>
          {@render heading("Social card")}
          <Input size="sm" aria-label="Title" placeholder={file_stem(source.name)} bind:value={options.value.card.title} />
          <Input size="sm" aria-label="Subtitle" placeholder="Subtitle" bind:value={options.value.card.subtitle} />
          <div class="flex items-center gap-2 text-ui">
            <span class="w-24 shrink-0">Background</span>
            {@render swatch("Card background", card_options.background ?? theme_hex, (value) => (options.value.card.background = value))}
            <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80 uppercase">{card_options.background ?? "Theme"}</span>
            {#if card_options.background}
              <IconButton label="Use the theme background" size="sm" onclick={() => (options.value.card.background = null)}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
            {/if}
          </div>
          <div class="flex items-center gap-2 text-ui">
            <span class="w-24 shrink-0">Font</span>
            <Segmented size="sm" label="Font" options={FONTS} bind:value={options.value.card.font} />
          </div>
        </div>
      </aside>

      <div class="stage min-h-0 overflow-auto p-3 [container-type:inline-size] @xl:p-4">
        {#if source.warnings.length}
          <ul class="mb-4 flex flex-col gap-1.5 rounded-lg bg-warning/10 p-3 text-ui">
            {#each source.warnings as warning (warning)}
              <li class="flex items-start gap-2"><WarningIcon class="mt-0.5 size-4 shrink-0 text-warning" weight="bold" /><span>{warning}</span></li>
            {/each}
          </ul>
        {/if}
        <Preview {icons} {card} options={icon} {title} />
      </div>
    </div>

    <StatusBar>
      <span>{source.svg === null ? source.width : "SVG"}{source.svg === null ? ` × ${source.height} px` : ""}</span>
      <span>{format_bytes(source.size)}</span>
      <span class="ml-auto truncate">{pack_name(source.name)}</span>
    </StatusBar>
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop to open</span>
    </div>
  {/if}
</div>

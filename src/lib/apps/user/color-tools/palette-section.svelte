<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { base_name } from "$lib/core/api/services/files/path";
  import { Button, EmptyState, IconButton, Spinner } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_date } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { report_error } from "$kit/utils/report-error";
  import {
    ArrowLeft as ArrowLeftIcon,
    Devices as DevicesIcon,
    FileX as FileXIcon,
    FolderOpen as FolderOpenIcon,
    Palette as PaletteIcon,
    Plus as PlusIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { to_hex, type Color } from "./color";
  import { format_color, parse_css } from "./models";
  import {
    add_color,
    clean_name,
    create_palette,
    EXTENSION,
    MAX_COLORS,
    MAX_NAME,
    PALETTES_DIR,
    parse_palette,
    remove_color,
    rename_color,
    type Palette,
  } from "./palette";
  import { list_palettes, save_new, type PaletteEntry } from "./palette-store";
  import Swatch from "./swatch.svelte";

  interface Props {
    path: string | null;
    palette: Palette | null;
    ready: boolean;
    error: string | null;
    color: Color;
    onedit: (change: (palette: Palette) => Palette) => void;
    onchange: (color: Color) => void;
  }

  let { path = $bindable(), palette, ready, error, color, onedit, onchange }: Props = $props();

  const { app_id, window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  let entries = $state.raw<PaletteEntry[]>([]);
  let loaded = $state(false);
  let list_request = 0;

  $effect(() => {
    if (path) return;
    files.revision(PALETTES_DIR);
    untrack(async () => {
      const id = ++list_request;
      try {
        const next = await list_palettes(files);
        if (id === list_request) entries = next;
      } catch (reason) {
        console.warn("[Color Tools] Couldn't list palettes:", reason);
      } finally {
        if (id === list_request) loaded = true;
      }
    });
  });

  $effect(() =>
    win.on_back(() => {
      if (!path) return false;
      path = null;
      return true;
    })
  );

  const full = $derived((palette?.colors.length ?? 0) >= MAX_COLORS);

  async function create() {
    const name = await win.prompt("New palette", {
      initial: "Palette",
      confirm_label: "Create",
      validate: (value) => (clean_name(value) ? null : "Give it a name."),
    });
    if (!name) return;
    try {
      path = await save_new(files, create_palette(name, [{ name: "", css: format_color(color, 5) }]));
    } catch (reason) {
      report_error(app_id, "Couldn't create the palette", reason);
    }
  }

  async function open_file() {
    const chosen = await win.pick_file({ accept: [EXTENSION], start_path: PALETTES_DIR, title: "Open palette" });
    if (chosen) path = chosen;
  }

  async function open_device() {
    const [file] = await pick_device_files({ accept: [EXTENSION] });
    if (!file) return;
    try {
      const parsed = parse_palette(await file.text());
      if (!parsed) throw new Error("It isn't a valid palette file.");
      path = await save_new(files, parsed);
    } catch (reason) {
      report_error(app_id, `Couldn't open ${file.name}`, reason);
    }
  }

  async function rename() {
    if (!palette) return;
    const next = await win.prompt("Rename palette", {
      initial: palette.name,
      confirm_label: "Rename",
      validate: (value) => (clean_name(value) ? null : "Give it a name."),
    });
    if (next && clean_name(next)) onedit((current) => ({ ...current, name: clean_name(next) }));
  }

  function add_current() {
    onedit((current) => add_color(current, { name: "", css: format_color(color, 5) }));
  }
</script>

{#if path}
  <div class="flex flex-wrap items-center gap-2">
    <IconButton label="All palettes" size="sm" onclick={() => (path = null)}><ArrowLeftIcon weight="bold" /></IconButton>
    <button
      type="button"
      class="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left text-base font-semibold hover:bg-foreground/6 focus-visible:outline-2 focus-visible:outline-cottontail"
      title="Rename"
      disabled={!palette}
      onclick={rename}
    >
      {palette?.name ?? base_name(path)}
    </button>
    {#if palette}
      <Button size="sm" variant="primary" disabled={full} onclick={add_current}><PlusIcon weight="bold" />Add current colour</Button>
    {/if}
  </div>

  {#if !ready}
    <div class="grid h-40 place-items-center"><Spinner label="Loading" /></div>
  {:else if error}
    <EmptyState icon={FileXIcon} tone="error" title="Couldn't read this palette" description="The file isn't a palette Color Tools can read." details={error}>
      {#snippet actions()}
        <Button onclick={() => (path = null)}>All palettes</Button>
      {/snippet}
    </EmptyState>
  {:else if !palette}
    <EmptyState icon={FileXIcon} title="This palette is gone" description="It was moved or deleted.">
      {#snippet actions()}
        <Button onclick={() => (path = null)}>All palettes</Button>
      {/snippet}
    </EmptyState>
  {:else if palette.colors.length === 0}
    <EmptyState icon={PaletteIcon} title="No colours yet" description="Add the current colour, or add a harmony from the Harmony section." />
  {:else}
    <ul class="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4">
      {#each palette.colors as entry, index (index)}
        {@const parsed = parse_css(entry.css)}
        <li class="flex min-w-0 flex-col gap-1.5 rounded-xl bg-background-light p-2 ring-1 ring-foreground/8">
          {#if parsed}
            <Swatch color={parsed} label="Use {entry.name || entry.css}" class="h-16 w-full" onclick={() => onchange(parsed)} />
          {/if}
          <input
            class="min-w-0 rounded-md bg-transparent px-1 py-0.5 text-ui font-medium placeholder:text-foreground/65 hover:bg-foreground/6 focus-visible:bg-background focus-visible:outline-2 focus-visible:outline-cottontail pointer-coarse:py-2"
            value={entry.name}
            maxlength={MAX_NAME}
            placeholder="Name"
            aria-label="Name of colour {index + 1}"
            onchange={(event) => onedit((current) => rename_color(current, index, event.currentTarget.value))}
          />
          <div class="flex min-w-0 items-center gap-1">
            <span class="min-w-0 flex-1 truncate px-1 font-mono text-2xs text-foreground/80" title={entry.css}>{parsed ? to_hex(parsed) : entry.css}</span>
            <IconButton label="Remove {entry.name || entry.css}" size="sm" onclick={() => onedit((current) => remove_color(current, index))}>
              <TrashIcon weight="bold" />
            </IconButton>
          </div>
        </li>
      {/each}
    </ul>
    <p class="text-2xs text-foreground/80">
      {palette.colors.length} of {MAX_COLORS} colours · saved as you go to {base_name(path)}
    </p>
  {/if}
{:else}
  <div class="flex flex-wrap items-center gap-2">
    <p class="min-w-0 flex-1 text-ui text-foreground/65">Named swatches, kept as {EXTENSION} files in Documents.</p>
    <Button size="sm" variant="quiet" onclick={open_file}><FolderOpenIcon weight="bold" />Open…</Button>
    <IconButton label="Open from device…" size="sm" onclick={open_device}><DevicesIcon weight="bold" /></IconButton>
    <Button size="sm" variant="primary" onclick={create}><PlusIcon weight="bold" />New palette</Button>
  </div>

  {#if !loaded}
    <div class="flex flex-col gap-1">
      {#each { length: 4 }, index (index)}
        <div class="h-10 animate-pulse rounded-md bg-foreground/5" style:opacity={1 - index * 0.2}></div>
      {/each}
    </div>
  {:else if entries.length === 0}
    <EmptyState icon={PaletteIcon} title="No palettes yet" description="Start one from the current colour, then add more as you go." />
  {:else}
    <ul class="flex flex-col">
      {#each entries as entry (entry.path)}
        <li>
          <button
            type="button"
            class="flex min-h-10 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-ui hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cottontail pointer-coarse:min-h-11"
            title={entry.path}
            onclick={() => (path = entry.path)}
          >
            <span class="flex h-6 w-20 shrink-0 overflow-hidden rounded-md ring-1 ring-foreground/10" aria-hidden="true">
              {#each entry.preview as css, index (index)}
                {@const parsed = parse_css(css)}
                <span class="h-full min-w-0 flex-1" style:background-color={parsed ? to_hex(parsed) : "transparent"}></span>
              {/each}
            </span>
            <span class="min-w-0 flex-1 truncate">{entry.name}</span>
            <span class="hidden shrink-0 text-2xs text-foreground/80 @md:block">{entry.count} {entry.count === 1 ? "colour" : "colours"}</span>
            <span class="w-24 shrink-0 text-right font-mono text-2xs text-foreground/80 tabular-nums">{format_date(entry.modified)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

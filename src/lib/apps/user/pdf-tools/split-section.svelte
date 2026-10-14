<script lang="ts">
  import kernel, { type AppsService } from "$lib/core/api";
  import { Button, IconButton, Input, Section as Group, Segmented, SettingRow, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { ArrowsSplit as ArrowsSplitIcon, Devices as DevicesIcon, FilePdf as FilePdfIcon, FolderOpen as FolderOpenIcon } from "phosphor-svelte";
  import { untrack, type Snippet } from "svelte";
  import { z } from "zod";
  import DropZone from "./drop-zone.svelte";
  import { run_job } from "./job";
  import { parent_path, part_name } from "./naming";
  import { split_pdf } from "./pdf";
  import { PDF_ACCEPT, device_source, write_into } from "./pdf-files";
  import PdfPlaceholder from "./pdf-placeholder.svelte";
  import { PdfSlot } from "./pdf-slot.svelte";
  import { chunks, every_page, flatten_groups, parse_ranges } from "./ranges";

  const { picker, initial_paths }: { picker: Snippet; initial_paths: string[] } = $props();
  const { app_id, window: win, storage } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));

  const Mode = { RANGES: "ranges", EXTRACT: "extract", EACH: "each", CHUNKS: "chunks" } as const;
  type Mode = (typeof Mode)[keyof typeof Mode];
  const MODES = [
    { value: Mode.RANGES, label: "Ranges" },
    { value: Mode.EXTRACT, label: "Extract" },
    { value: Mode.EACH, label: "Every page" },
    { value: Mode.CHUNKS, label: "Every N" },
  ];

  const mode = storage.window<Mode>("split-mode", Mode.RANGES, z.enum([Mode.RANGES, Mode.EXTRACT, Mode.EACH, Mode.CHUNKS]));
  let ranges = $state("1-3, 5");
  let size = $state(2);
  let busy = $state(false);

  const slot = new PdfSlot();
  const loaded = $derived(slot.loaded);
  $effect(() => () => slot.close());

  const first = untrack(() => initial_paths[0]);
  if (first) void slot.open(first);

  const plan = $derived.by((): { groups: number[][]; error: string | null } => {
    if (!loaded) return { groups: [], error: null };
    if (mode.value === Mode.EACH) return { groups: every_page(loaded.count), error: null };
    if (mode.value === Mode.CHUNKS) return { groups: chunks(loaded.count, size), error: size >= 1 ? null : "Enter how many pages go in each file" };
    const parsed = parse_ranges(ranges, loaded.count);
    if (!parsed.ok) return { groups: [], error: parsed.error };
    return { groups: mode.value === Mode.EXTRACT ? [flatten_groups(parsed.groups)] : parsed.groups, error: null };
  });

  const DESCRIPTIONS: Record<Mode, string> = {
    ranges: "One file per range: “1-3, 5” makes two files.",
    extract: "The listed pages, in that order, as one file.",
    each: "Every page as its own file.",
    chunks: "A new file every N pages.",
  };

  async function pick() {
    const path = await win.pick_file({ accept: PDF_ACCEPT, title: "Split a PDF" });
    if (path) await slot.open(path);
  }

  async function pick_device() {
    const [file] = await pick_device_files({ accept: PDF_ACCEPT });
    if (file) await slot.open(device_source(file));
  }

  async function split() {
    if (!loaded || !plan.groups.length || busy) return;
    const folder = await win.pick_directory({ title: "Save the parts into", start_path: loaded.source.path ? parent_path(loaded.source.path) : "/home" });
    if (!folder) return;
    const { source, bytes } = loaded;
    const groups = plan.groups;
    busy = true;
    await run_job(app_id, `Splitting ${source.name}`, groups.length, async (step) => {
      let written = 0;
      for await (const part of split_pdf(bytes, groups, source.name)) {
        await write_into(folder, part_name(source.name, part.pages), part.bytes);
        written++;
        await step();
      }
      return { title: "PDF split", message: `${written} ${written === 1 ? "file" : "files"} in ${folder}`, actions: [{ label: "Show", on_click: () => apps.open(folder) }] };
    });
    busy = false;
  }
</script>

<DropZone label="Drop a PDF to split it" class="grid h-full grid-rows-[auto_1fr_auto]" ondrop={(sources) => void slot.open(sources[0])}>
  <Toolbar>
    {@render picker()}
    <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Open from device…" size="sm" onclick={pick_device}><DevicesIcon weight="bold" /></IconButton>
    <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">{loaded?.source.name ?? ""}</span>
    {#if loaded}
      <Button variant="primary" size="sm" onclick={split} disabled={busy || !!plan.error || !plan.groups.length}><ArrowsSplitIcon weight="bold" /> Split…</Button>
    {/if}
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    {#if !loaded}
      <PdfPlaceholder {slot} icon={ArrowsSplitIcon} title="No PDF open" description="Split a PDF by page ranges, extract pages, or give every page its own file." onopen={pick} ondevice={pick_device} />
    {:else}
      <div class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-5 @md:px-6">
        <Group title="How to split" description={DESCRIPTIONS[mode.value]}>
          <div class="overflow-x-auto px-4 py-3"><Segmented label="Split mode" options={MODES} bind:value={mode.value} /></div>
          {#if mode.value === Mode.RANGES || mode.value === Mode.EXTRACT}
            <SettingRow label="Pages" description={plan.error ?? `1 to ${loaded.count}. Use commas between ranges; “8-” runs to the end.`}>
              {#snippet children({ id, describedby })}
                <Input {id} aria-describedby={describedby} aria-invalid={!!plan.error} class="w-44 font-mono" bind:value={ranges} placeholder="1-3, 5" />
              {/snippet}
            </SettingRow>
          {:else if mode.value === Mode.CHUNKS}
            <SettingRow label="Pages per file">
              {#snippet children({ id })}
                <Input {id} type="number" min="1" max={loaded?.count} class="w-24 font-mono" bind:value={size} />
              {/snippet}
            </SettingRow>
          {/if}
        </Group>

        <Group title="Files" description={plan.groups.length ? `Saved into a folder you pick. ${plan.groups.length} ${plan.groups.length === 1 ? "file" : "files"}.` : "Fix the pages above to see the files."}>
          {#if plan.groups.length}
            <ul class="max-h-72 overflow-auto py-1">
              {#each plan.groups.slice(0, 200) as group, index (index)}
                <li class="flex h-8 items-center gap-2 px-4">
                  <FilePdfIcon weight="duotone" class="size-4 shrink-0 text-foreground/70" />
                  <span class="min-w-0 flex-1 truncate text-ui">{part_name(loaded.source.name, group)}</span>
                  <span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{group.length} {group.length === 1 ? "page" : "pages"}</span>
                </li>
              {/each}
              {#if plan.groups.length > 200}<li class="px-4 py-1 text-2xs text-foreground/65">and {plan.groups.length - 200} more</li>{/if}
            </ul>
          {/if}
        </Group>
      </div>
    {/if}
  </div>

  <StatusBar>
    {#if loaded}
      <span>{loaded.count} {loaded.count === 1 ? "page" : "pages"}</span>
      <span>{plan.groups.length} {plan.groups.length === 1 ? "file" : "files"}</span>
    {:else}
      <span>No PDF</span>
    {/if}
  </StatusBar>
</DropZone>

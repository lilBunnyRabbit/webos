<script lang="ts">
  import kernel, { type AppsService } from "$lib/core/api";
  import { Button, IconButton, Input, Section as Group, Segmented, Select, SettingRow, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { Devices as DevicesIcon, Export as ExportIcon, FolderOpen as FolderOpenIcon } from "phosphor-svelte";
  import { untrack, type Snippet } from "svelte";
  import { z } from "zod";
  import DropZone from "./drop-zone.svelte";
  import { run_job } from "./job";
  import { page_image_name, parent_path } from "./naming";
  import { PDF_ACCEPT, device_source, write_into } from "./pdf-files";
  import PdfPlaceholder from "./pdf-placeholder.svelte";
  import { PdfSlot } from "./pdf-slot.svelte";
  import PdfThumb from "./pdf-thumb.svelte";
  import { flatten_groups, parse_ranges } from "./ranges";
  import { canvas_blob, page_info, render_page } from "./render";
  import { ThumbCache } from "./thumbs.svelte";

  const { picker, initial_paths }: { picker: Snippet; initial_paths: string[] } = $props();
  const { app_id, window: win, storage } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));

  const FORMATS = [
    { value: "png", label: "PNG" },
    { value: "jpg", label: "JPEG" },
  ] as const;
  const SCALES = [
    { value: "1", label: "1× · 72 dpi" },
    { value: "2", label: "2× · 144 dpi" },
    { value: "3", label: "3× · 216 dpi" },
    { value: "4", label: "4× · 288 dpi" },
  ];

  const settings = storage.persisted(
    "export",
    { format: "png" as "png" | "jpg", scale: "2" },
    z.object({ format: z.enum(["png", "jpg"]), scale: z.enum(["1", "2", "3", "4"]) })
  );
  let all_pages = $state(true);
  let ranges = $state("1");
  let busy = $state(false);
  let first_size = $state<{ width: number; height: number } | null>(null);

  const slot = new PdfSlot();
  const loaded = $derived(slot.loaded);
  let cache = $state.raw<ThumbCache | null>(null);

  $effect(() => () => slot.close());
  $effect(() => {
    const current = loaded;
    if (!current) return;
    const next = new ThumbCache(current.document, 360, () => !win.is_visible);
    untrack(() => (cache = next));
    void page_info(current.document, 0).then((info) => (first_size = info));
    return () => next.destroy();
  });
  $effect(() => {
    if (win.is_visible) void cache?.pump();
  });

  const first = untrack(() => initial_paths[0]);
  if (first) void slot.open(first);

  const pages = $derived.by((): { list: number[]; error: string | null } => {
    if (!loaded) return { list: [], error: null };
    if (all_pages) return { list: Array.from({ length: loaded.count }, (_, index) => index + 1), error: null };
    const parsed = parse_ranges(ranges, loaded.count);
    return parsed.ok ? { list: flatten_groups(parsed.groups), error: null } : { list: [], error: parsed.error };
  });

  const pixel_size = $derived(
    first_size ? `${Math.round(first_size.width * Number(settings.value.scale))} × ${Math.round(first_size.height * Number(settings.value.scale))} px` : ""
  );

  async function pick() {
    const path = await win.pick_file({ accept: PDF_ACCEPT, title: "Export pages from a PDF" });
    if (path) await slot.open(path);
  }

  async function pick_device() {
    const [file] = await pick_device_files({ accept: PDF_ACCEPT });
    if (file) await slot.open(device_source(file));
  }

  async function export_pages() {
    if (!loaded || !pages.list.length || busy) return;
    const folder = await win.pick_directory({ title: "Save the images into", start_path: loaded.source.path ? parent_path(loaded.source.path) : "/home" });
    if (!folder) return;
    const { document, source, count } = loaded;
    const list = pages.list;
    const { format, scale } = settings.value;
    const type = format === "png" ? "image/png" : "image/jpeg";
    busy = true;
    await run_job(app_id, `Exporting ${list.length} ${list.length === 1 ? "page" : "pages"}`, list.length, async (step) => {
      for (const page of list) {
        const canvas = await render_page(document, page - 1, Number(scale));
        const blob = await canvas_blob(canvas, type, 0.92);
        canvas.width = canvas.height = 0;
        await write_into(folder, page_image_name(source.name, page, count, format), blob);
        await step(`Page ${page} of ${count}`);
      }
      return { title: "Pages exported", message: `${list.length} ${format.toUpperCase()} ${list.length === 1 ? "image" : "images"} in ${folder}`, actions: [{ label: "Show", on_click: () => apps.open(folder) }] };
    });
    busy = false;
  }
</script>

<DropZone label="Drop a PDF to export its pages" class="grid h-full grid-rows-[auto_1fr_auto]" ondrop={(sources) => void slot.open(sources[0])}>
  <Toolbar>
    {@render picker()}
    <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Open from device…" size="sm" onclick={pick_device}><DevicesIcon weight="bold" /></IconButton>
    <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">{loaded?.source.name ?? ""}</span>
    {#if loaded}
      <Button variant="primary" size="sm" onclick={export_pages} disabled={busy || !pages.list.length}><ExportIcon weight="bold" /> Export…</Button>
    {/if}
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    {#if !loaded}
      <PdfPlaceholder {slot} icon={ExportIcon} title="No PDF open" description="Save pages as PNG or JPEG images, at the resolution you pick." onopen={pick} ondevice={pick_device} />
    {:else}
      <div class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-5 @md:px-6 @xl:flex-row @xl:items-start">
        <div class="mx-auto w-40 shrink-0 @xl:mx-0">
          <PdfThumb {cache} index={0} class="rounded-lg bg-background-darker p-2" />
          <p class="mt-1.5 text-center font-mono text-2xs text-foreground/65">page 1</p>
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-6">
          <Group title="Images">
            <SettingRow label="Format" description={settings.value.format === "png" ? "Sharp, larger files." : "Smaller files, slight blur on text."}>
              {#snippet children({ id })}
                <Segmented {id} size="sm" label="Format" options={[...FORMATS]} bind:value={settings.value.format} />
              {/snippet}
            </SettingRow>
            <SettingRow label="Resolution" description={pixel_size ? `Page 1 becomes ${pixel_size}.` : undefined}>
              {#snippet children({ id })}
                <Select {id} size="sm" class="w-36" options={SCALES} bind:value={settings.value.scale} />
              {/snippet}
            </SettingRow>
          </Group>
          <Group title="Pages">
            <SettingRow label="Every page" description={`${loaded.count} ${loaded.count === 1 ? "page" : "pages"}`}>
              {#snippet children({ id })}
                <Switch {id} bind:checked={all_pages} />
              {/snippet}
            </SettingRow>
            {#if !all_pages}
              <SettingRow label="Pages" description={pages.error ?? "Like 1-3, 5"}>
                {#snippet children({ id, describedby })}
                  <Input {id} aria-describedby={describedby} aria-invalid={!!pages.error} class="w-44 font-mono" bind:value={ranges} />
                {/snippet}
              </SettingRow>
            {/if}
          </Group>
        </div>
      </div>
    {/if}
  </div>

  <StatusBar>
    {#if loaded}
      <span>{pages.list.length} of {loaded.count} {loaded.count === 1 ? "page" : "pages"}</span>
      <span>{settings.value.format.toUpperCase()} · {settings.value.scale}×</span>
    {:else}
      <span>No PDF</span>
    {/if}
  </StatusBar>
</DropZone>

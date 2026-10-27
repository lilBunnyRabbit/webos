<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { PATHS } from "$lib/core/api/services/files/hierarchy";
  import { base_name } from "$lib/core/api/services/files/path";
  import { Button, EmptyState, IconButton, Spinner, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import DropZone from "$lib/apps/user/pdf-tools/drop-zone.svelte";
  import { is_image_name } from "$lib/apps/user/pdf-tools/naming";
  import { is_image, type SourceFile } from "$lib/apps/user/pdf-tools/pdf-files";
  import { report_error } from "$kit/utils/report-error";
  import {
    ArrowLeft as ArrowLeftIcon,
    Camera as CameraIcon,
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    FilePdf as FilePdfIcon,
    FolderOpen as FolderOpenIcon,
    Scan as ScanIcon,
    Trash as TrashIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { z } from "zod";
  import { export_pdf } from "./export";
  import { scan_name } from "./layout";
  import PageEditor from "./page-editor.svelte";
  import { ScanPage } from "./page.svelte";
  import { PageFilter } from "./warp";

  interface Props {
    photo?: boolean;
    path?: string;
    paths?: string[];
  }

  let { photo, path, paths }: Props = $props();
  const { window: win, storage, app_id } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  const IMAGE_ACCEPT = ["image/*"];
  const filter = storage.persisted<PageFilter>("filter", PageFilter.COLOR, z.enum(PageFilter));
  // Props come back with a restored window, the pages don't: without this a reload would ask for a photo again.
  const launched = storage.window("launched", false, z.boolean());

  let pages = $state.raw<ScanPage[]>([]);
  let editing = $state<string | null>(null);
  let preview = $state(false);
  let saving = $state(false);
  let saved = $state<string | null>(null);

  const page = $derived(pages.find((candidate) => candidate.id === editing) ?? null);
  const index = $derived(page ? pages.indexOf(page) : -1);
  const state_key = $derived(pages.map((each) => `${each.id}:${each.filter}:${JSON.stringify(each.quad)}`).join("|"));
  const dirty = $derived(pages.length > 0 && saved !== state_key);

  $effect(() => win.set_dirty(dirty, { save }));
  $effect(() => win.set_title(pages.length ? `${pages.length} ${pages.length === 1 ? "page" : "pages"}` : null));
  $effect(() => {
    if (!editing) return;
    return win.on_back(() => (close_editor(), true));
  });
  $effect(() => {
    if (page) filter.value = page.filter;
  });

  function add(sources: { blob: Blob; name: string }[]) {
    const images = sources.filter(({ blob, name }) => blob.type.startsWith("image/") || is_image_name(name));
    if (!images.length) return report_error(app_id, "Nothing to scan", "Pick a photo or another picture.");
    const added = images.map(({ blob, name }) => new ScanPage(blob, name, filter.value));
    pages = [...pages, ...added];
    void (async () => {
      for (const each of added) await each.prepare();
    })();
    if (added.length === 1) edit(added[0]);
  }

  const add_sources = (sources: SourceFile[]) => add(sources.filter(is_image).map((source) => ({ blob: source.file, name: source.name })));

  async function take() {
    const chosen = await pick_device_files({ accept: IMAGE_ACCEPT, multiple: true });
    if (chosen.length) add(chosen.map((file) => ({ blob: file, name: file.name })));
  }

  async function open_paths(list: string[]) {
    const loaded: { blob: Blob; name: string }[] = [];
    for (const target of list) {
      const file = await files.get_file(target).catch(() => null);
      if (file) loaded.push({ blob: file, name: base_name(target) });
      else report_error(app_id, "Couldn't open the picture", `${target} no longer exists.`);
    }
    if (loaded.length) add(loaded);
  }

  async function from_files() {
    const chosen = await win.pick_file({ accept: IMAGE_ACCEPT, multiple: true, title: "Pictures to scan" });
    if (chosen.length) await open_paths(chosen);
  }

  function edit(target: ScanPage) {
    preview = false;
    editing = target.id;
  }

  function close_editor() {
    if (page && !page.current) void page.render();
    editing = null;
  }

  function move(from: number, by: number) {
    const to = from + by;
    if (to < 0 || to >= pages.length) return;
    const next = [...pages];
    [next[from], next[to]] = [next[to], next[from]];
    pages = next;
  }

  function remove(target: ScanPage) {
    if (editing === target.id) editing = null;
    pages = pages.filter((candidate) => candidate !== target);
    target.dispose();
  }

  async function save(): Promise<boolean> {
    if (!pages.length || saving) return false;
    const target = await win.pick_save({ name: scan_name(), start_path: PATHS.documents, accept: [".pdf"], title: "Save the scan" });
    if (!target) return false;
    saving = true;
    const key = state_key;
    try {
      const done = await export_pdf(pages, target);
      if (done) saved = key;
      return done;
    } finally {
      saving = false;
    }
  }

  const initial = untrack(() => ({ photo, paths: [...(paths ?? []), ...(path ? [path] : [])] }));
  if (!launched.value) {
    launched.value = true;
    if (initial.paths.length) void open_paths(initial.paths);
    else if (initial.photo) void take();
  }

  onDestroy(() => {
    for (const each of pages) each.dispose();
  });
</script>

<DropZone ondrop={add_sources} label="Drop pictures to scan" accept={IMAGE_ACCEPT} multiple active={!editing} class="flex h-full min-h-0 flex-col bg-background @container">
  {#if page}
    <Toolbar>
      <Button size="sm" variant="quiet" onclick={close_editor}><ArrowLeftIcon /> Pages</Button>
      <span class="mr-auto min-w-0 truncate text-ui font-medium">Page {index + 1} of {pages.length}</span>
      <IconButton size="sm" label="Delete page {index + 1}" onclick={() => remove(page)}><TrashIcon /></IconButton>
      <Button size="sm" variant="primary" onclick={close_editor}>Done</Button>
    </Toolbar>
    <div class="min-h-0 flex-1">
      <PageEditor {page} bind:preview />
    </div>
  {:else}
    <Toolbar>
      <Button size="sm" variant={pages.length ? "secondary" : "primary"} onclick={() => void take()}><CameraIcon /> Add photos</Button>
      <Button size="sm" variant="quiet" onclick={() => void from_files()}><FolderOpenIcon /> From files…</Button>
      {#if pages.length}
        <Button size="sm" variant="primary" class="ml-auto" disabled={saving} onclick={() => void save()}>
          {#if saving}<Spinner label="Saving" class="size-3.5" />{:else}<FilePdfIcon />{/if}Save PDF
        </Button>
      {/if}
    </Toolbar>
    {#if pages.length === 0}
      <EmptyState
        icon={ScanIcon}
        title="Scan a document"
        description="Photograph a page at any angle, or pick photos you have. Doc Scan finds each page's edges and straightens it; drop or paste pictures here too."
      >
        {#snippet actions()}
          <Button variant="primary" onclick={() => void take()}><CameraIcon /> Take or choose photos</Button>
          <Button onclick={() => void from_files()}><FolderOpenIcon /> From files…</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <ol class="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-3 @md:grid-cols-3 @2xl:grid-cols-4" aria-label="Pages">
        {#each pages as each, at (each.id)}
          <li class="flex min-w-0 flex-col gap-1">
            <button
              type="button"
              class="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-lg bg-background-darker ring-1 ring-foreground/10 transition-shadow hover:ring-primary focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none"
              aria-label="Edit page {at + 1}"
              onclick={() => edit(each)}
            >
              {#if each.result_url}
                <img src={each.result_url} alt="" class="size-full object-contain p-2" />
              {:else if each.error}
                <span class="grid place-items-center gap-1 p-2 text-center text-2xs text-error"><WarningIcon class="size-5" />{each.error}</span>
              {:else}
                <Spinner label="Straightening page {at + 1}" />
              {/if}
              {#if each.busy && each.result_url}
                <span class="absolute top-1.5 right-1.5 rounded-full bg-background-light p-1"><Spinner label="Straightening" class="size-3" /></span>
              {/if}
              <span class="absolute top-1.5 left-1.5 rounded-sm bg-background-light px-1.5 font-mono text-2xs tabular-nums">{at + 1}</span>
            </button>
            <div class="flex items-center justify-center">
              <IconButton label="Move page {at + 1} earlier" disabled={at === 0} onclick={() => move(at, -1)}><CaretLeftIcon /></IconButton>
              <IconButton label="Move page {at + 1} later" disabled={at === pages.length - 1} onclick={() => move(at, 1)}><CaretRightIcon /></IconButton>
              <IconButton label="Delete page {at + 1}" onclick={() => remove(each)}><TrashIcon /></IconButton>
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
</DropZone>

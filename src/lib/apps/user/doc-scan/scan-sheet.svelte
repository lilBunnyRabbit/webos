<script lang="ts">
  import kernel, { type AppSheetProps, type FilesService } from "$lib/core/api";
  import { base_name } from "$lib/core/api/services/files/path";
  import { Button, EmptyState, Spinner } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { Camera as CameraIcon, FolderOpen as FolderOpenIcon, Scan as ScanIcon } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import PageEditor from "./page-editor.svelte";
  import { ScanPage } from "./page.svelte";
  import type { ScanInput } from "./sheet-types";
  import { PageFilter } from "./warp";

  let { input, resolve }: AppSheetProps<ScanInput, Blob> = $props();

  // The caller's window: its pickers open over it, and nothing of Doc Scan's own is stored in the caller's storage.
  const { window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  let page = $state.raw<ScanPage | null>(null);
  let preview = $state(false);
  let using = $state(false);

  function start(source: Blob, name: string) {
    page?.dispose();
    preview = false;
    page = new ScanPage(source, name, PageFilter.COLOR);
    void page.prepare();
  }

  async function take() {
    const [file] = await pick_device_files({ accept: ["image/*"] });
    if (file) start(file, file.name);
  }

  async function from_files() {
    const path = await win.pick_file({ accept: ["image/*"], title: "Scan a picture" });
    const file = path ? await files.get_file(path) : null;
    if (path && file) start(file, base_name(path));
  }

  async function use() {
    if (!page) return;
    using = true;
    try {
      const blob = await page.render();
      if (blob) resolve(blob);
    } finally {
      using = false;
    }
  }

  const source = untrack(() => input?.source);
  if (source) start(source, "Photo");
  else void take();

  onDestroy(() => page?.dispose());
</script>

<div class="flex h-[min(40rem,calc(100cqh-2rem))] w-[min(46rem,calc(100cqw-2rem))] flex-col overflow-hidden rounded-2xl bg-background shadow-popover">
  <h2 class="shrink-0 border-b border-foreground/8 bg-background-lighter px-4 py-3 text-ui font-semibold">Scan a page</h2>
  <div class="min-h-0 flex-1">
    {#if page}
      <PageEditor {page} bind:preview />
    {:else}
      <EmptyState icon={ScanIcon} title="Photograph a page" description="Take a photo of the page, or pick one. Its edges are found for you.">
        {#snippet actions()}
          <Button variant="primary" onclick={() => void take()}><CameraIcon /> Take or choose a photo</Button>
          <Button onclick={() => void from_files()}><FolderOpenIcon /> From files…</Button>
        {/snippet}
      </EmptyState>
    {/if}
  </div>
  <div class="flex shrink-0 items-center gap-2 border-t border-foreground/8 bg-background-lighter px-3 py-2.5">
    {#if page}
      <Button variant="quiet" onclick={() => void take()}><CameraIcon /> Retake</Button>
    {/if}
    <Button variant="quiet" class="ml-auto" onclick={() => resolve(null)}>Cancel</Button>
    <Button variant="primary" disabled={!page?.ready || using} onclick={() => void use()}>
      {#if using}<Spinner label="Straightening" class="size-3.5" />{/if}Use page
    </Button>
  </div>
</div>

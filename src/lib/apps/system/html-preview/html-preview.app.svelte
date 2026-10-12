<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, EmptyState, IconButton, Segmented, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { format_bytes } from "$lib/core/utils";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    Code as CodeIcon,
    Eye as EyeIcon,
    FileHtml as FileHtmlIcon,
    FolderOpen as FolderOpenIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import manifest from "./index";

  const { path: initial_path }: { path?: string } = $props();

  // Starts at the launched file; "Open…" swaps it in place.
  let path = $state(untrack(() => initial_path));
  let view = $state<"preview" | "source">("preview");
  let revision = $state(0);

  const { window } = get_app_context();

  async function pick() {
    const chosen = await window.pick_file({ accept: manifest.associations, title: "Open in HTML Preview" });
    if (chosen) path = chosen;
  }

  const files = $derived(kernel.service<FilesService>("files"));
  // Reading `revision` makes Reload produce a new promise, which re-reads the file and remounts the iframe.
  const loading = $derived.by(() => {
    void revision;
    if (!path) return null;
    return files.get_file(path).then(async (file) => (file ? { file, text: await file.text() } : null));
  });
  const name = $derived(path?.split("/").at(-1) ?? "");
</script>

{#if !loading}
  <EmptyState icon={FileHtmlIcon} title="No file open" description="Pick an HTML file, or open one from File Explorer.">
    {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button>{/snippet}
  </EmptyState>
{:else}
  {#await loading}
    <div class="grid h-full place-items-center"><Spinner label="Reading file" /></div>
  {:then loaded}
    {#if !loaded}
      <EmptyState icon={WarningCircleIcon} tone="error" title="File not found" description={path} />
    {:else}
      <div class="grid h-full grid-rows-[auto_1fr_auto]">
        <Toolbar>
          <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
          <IconButton label="Reload" size="sm" onclick={() => revision++}><ArrowClockwiseIcon weight="bold" /></IconButton>
          <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80" title={path}>{path}</span>
          <Segmented
            size="sm"
            label="View"
            bind:value={view}
            options={[
              { value: "preview", label: "Preview", icon: EyeIcon },
              { value: "source", label: "Source", icon: CodeIcon },
            ]}
          />
        </Toolbar>

        {#if view === "preview"}
          <!-- No allow-same-origin: the page runs in an opaque origin, so its scripts can't reach the OS, its storage or OPFS. -->
          <iframe srcdoc={loaded.text} sandbox="allow-scripts" title={name} class="block size-full border-0"></iframe>
        {:else}
          <pre class="min-h-0 overflow-auto p-4 font-mono text-ui leading-6 wrap-anywhere whitespace-pre-wrap">{loaded.text}</pre>
        {/if}

        <StatusBar>
          <span>{name}</span>
          <span class="ml-auto">{loaded.text.split("\n").length} lines</span>
          <span>{format_bytes(loaded.file.size)}</span>
          <span>{loaded.file.type || "text/html"}</span>
        </StatusBar>
      </div>
    {/if}
  {:catch error}
    <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't read the file" description={error instanceof Error ? error.message : String(error)} />
  {/await}
{/if}

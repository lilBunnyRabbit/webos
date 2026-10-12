<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, CopyButton, EmptyState, IconButton, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn, format_bytes } from "$lib/core/utils";
  import {
    FileText as FileTextIcon,
    FolderOpen as FolderOpenIcon,
    TextAlignLeft as TextAlignLeftIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { z } from "zod";
  import { untrack } from "svelte";
  import manifest from "./index";

  const { path: initial_path }: { path?: string } = $props();

  // Starts at the launched file; "Open…" swaps it in place.
  let path = $state(untrack(() => initial_path));

  const { storage, window } = get_app_context();

  async function pick() {
    const chosen = await window.pick_file({ accept: manifest.associations, title: "Open in Text Viewer" });
    if (chosen) path = chosen;
  }
  const wrap = storage.window("wrap", true, z.boolean());

  const files = $derived(kernel.service<FilesService>("files"));
  const file = $derived(path ? files.get_file(path) : null);
  const name = $derived(path?.split("/").at(-1) ?? "");
</script>

{#if !file}
  <EmptyState icon={FileTextIcon} title="No file open" description="Pick a text file, or open one from File Explorer.">
    {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button>{/snippet}
  </EmptyState>
{:else}
  {#await file.then(async (result) => (result ? { file: result, text: await result.text() } : null))}
    <div class="grid h-full place-items-center"><Spinner label="Reading file" /></div>
  {:then loaded}
    {#if !loaded}
      <EmptyState icon={WarningCircleIcon} tone="error" title="File not found" description={path} />
    {:else}
      {@const lines = loaded.text.split("\n")}
      <div class="grid h-full grid-rows-[auto_1fr_auto]">
        <Toolbar>
          <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
          <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80" title={path}>{path}</span>
          <IconButton label={wrap.value ? "Don't wrap lines" : "Wrap lines"} size="sm" pressed={wrap.value} onclick={() => (wrap.value = !wrap.value)}>
            <TextAlignLeftIcon weight="bold" />
          </IconButton>
          <CopyButton text={loaded.text} label="Copy all" />
        </Toolbar>

        <div class="min-h-0 overflow-auto">
          <!-- Gutter and text share one grid, so wrapped lines keep their number aligned to the first visual row. -->
          <div class="grid grid-cols-[auto_minmax(0,1fr)] font-mono text-ui leading-6">
            {#each lines as line, index (index)}
              <span class="sticky left-0 bg-background pr-4 pl-4 text-right text-foreground/65 tabular-nums select-none">{index + 1}</span>
              <span class={cn("pr-4", wrap.value ? "wrap-anywhere whitespace-pre-wrap" : "whitespace-pre")}>{line || " "}</span>
            {/each}
          </div>
        </div>

        <StatusBar>
          <span>{name}</span>
          <span class="ml-auto">{lines.length} lines</span>
          <span>{loaded.text.length} chars</span>
          <span>{format_bytes(loaded.file.size)}</span>
          <span>{loaded.file.type || "text/plain"}</span>
        </StatusBar>
      </div>
    {/if}
  {:catch error}
    <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't read the file" description={error instanceof Error ? error.message : String(error)} />
  {/await}
{/if}

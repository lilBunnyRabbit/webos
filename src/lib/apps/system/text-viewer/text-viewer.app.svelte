<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { EmptyState, IconButton, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn, format_bytes } from "$lib/core/utils";
  import {
    Check as CheckIcon,
    Copy as CopyIcon,
    FileText as FileTextIcon,
    TextAlignLeft as TextAlignLeftIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { z } from "zod";
  import { report_file_error } from "$lib/core/components/files/file-explorer.errors";

  const { path }: { path?: string } = $props();

  const { storage } = get_app_context();
  const wrap = storage.persisted("wrap", true, z.boolean());

  const files = $derived(kernel.service<FilesService>("files"));
  const file = $derived(path ? files.get_file(path) : null);
  const name = $derived(path?.split("/").at(-1) ?? "");

  let copied = $state(false);
  let copied_timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => () => clearTimeout(copied_timer));

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      report_file_error("Couldn't copy to the clipboard", error);
      return;
    }
    copied = true;
    clearTimeout(copied_timer);
    copied_timer = setTimeout(() => (copied = false), 1200);
  }
</script>

{#if !file}
  <EmptyState icon={FileTextIcon} title="No file open" description="Open a text file from File Explorer to read it here." />
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
          <FileTextIcon class="ml-1 size-4 shrink-0 text-foreground/65" weight="duotone" />
          <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80" title={path}>{path}</span>
          <IconButton label={wrap.value ? "Don't wrap lines" : "Wrap lines"} size="sm" aria-pressed={wrap.value} class={cn(wrap.value && "bg-foreground/10 text-foreground")} onclick={() => (wrap.value = !wrap.value)}>
            <TextAlignLeftIcon weight="bold" />
          </IconButton>
          <IconButton label={copied ? "Copied" : "Copy all"} size="sm" onclick={() => copy(loaded.text)}>
            {#if copied}<CheckIcon weight="bold" class="text-success" />{:else}<CopyIcon weight="bold" />{/if}
          </IconButton>
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

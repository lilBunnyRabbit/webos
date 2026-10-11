<script lang="ts">
  import kernel, { file_extension, type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, EmptyState, IconButton, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { format_bytes } from "$lib/core/utils";
  import { FileCsv as FileCsvIcon, FolderOpen as FolderOpenIcon, WarningCircle as WarningCircleIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { column_label, delimiter_for, parse_csv } from "./csv";
  import manifest from "./index";

  const { path: initial_path }: { path?: string } = $props();

  // Starts at the launched file; "Open…" swaps it in place.
  let path = $state(untrack(() => initial_path));
  let has_header = $state(true);

  const { window } = get_app_context();

  async function pick() {
    const chosen = await window.pick_file({ accept: manifest.associations, title: "Open in CSV Viewer" });
    if (chosen) path = chosen;
  }

  const files = $derived(kernel.service<FilesService>("files"));
  const loading = $derived(
    path
      ? files.get_file(path).then(async (file) => {
          if (!file) return null;
          const delimiter = delimiter_for(file_extension(file.name));
          const rows = parse_csv(await file.text(), delimiter);
          const column_count = rows.reduce((max, row) => Math.max(max, row.length), 0);
          return { file, delimiter, rows, column_count };
        })
      : null
  );
  const name = $derived(path?.split("/").at(-1) ?? "");
</script>

{#if !loading}
  <EmptyState icon={FileCsvIcon} title="No file open" description="Pick a CSV or TSV file, or open one from File Explorer.">
    {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button>{/snippet}
  </EmptyState>
{:else}
  {#await loading}
    <div class="grid h-full place-items-center"><Spinner label="Reading file" /></div>
  {:then loaded}
    {#if !loaded}
      <EmptyState icon={WarningCircleIcon} tone="error" title="File not found" description={path} />
    {:else}
      {@const header = has_header && loaded.rows.length > 0 ? loaded.rows[0] : null}
      {@const body = header ? loaded.rows.slice(1) : loaded.rows}
      {@const columns = Array.from({ length: loaded.column_count }, (_, index) => index)}
      <!-- Every row is its own grid on one fixed template, so rows line up and each can skip rendering off screen. -->
      {@const template = `${String(body.length).length + 3}ch repeat(${loaded.column_count}, 12rem)`}
      <div class="grid h-full grid-rows-[auto_1fr_auto]">
        <Toolbar>
          <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
          <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80" title={path}>{path}</span>
          <label class="flex shrink-0 items-center gap-2 px-1 text-ui">
            First row is header
            <Switch bind:checked={has_header} />
          </label>
        </Toolbar>

        {#if loaded.column_count === 0}
          <EmptyState icon={FileCsvIcon} title="This file is empty" description="There are no rows to show." />
        {:else}
          <div class="min-h-0 overflow-auto">
            <div class="w-max min-w-full font-mono text-ui">
              <div class="sticky top-0 z-10 grid h-7 items-center border-b border-foreground/8 bg-background-light text-2xs font-medium" style:grid-template-columns={template}>
                <span class="sticky left-0 z-10 h-full bg-background-light"></span>
                {#each columns as column (column)}
                  {@const label = header ? (header[column] ?? "") : column_label(column)}
                  <span class="truncate px-2" title={label}>{label}</span>
                {/each}
              </div>
              {#each body as row, index (index)}
                <div class="grid h-7 items-center border-b border-foreground/6 [contain-intrinsic-block-size:auto_1.75rem] [content-visibility:auto]" style:grid-template-columns={template}>
                  <span class="sticky left-0 flex h-full items-center justify-end bg-background pr-3 text-2xs text-foreground/65 tabular-nums select-none">{index + 1}</span>
                  {#each columns as column (column)}
                    <span class="truncate px-2" title={row[column]}>{row[column] ?? ""}</span>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <StatusBar>
          <span>{name}</span>
          <span class="ml-auto">{body.length} rows × {loaded.column_count} columns</span>
          <span>{loaded.delimiter === "\t" ? "Tab" : "Comma"}</span>
          <span>{format_bytes(loaded.file.size)}</span>
        </StatusBar>
      </div>
    {/if}
  {:catch error}
    <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't read the file" description={error instanceof Error ? error.message : String(error)} />
  {/await}
{/if}

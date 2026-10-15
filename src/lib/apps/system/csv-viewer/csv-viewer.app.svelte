<script lang="ts">
  import kernel, { file_extension, type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { Button, EmptyState, IconButton, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { format_bytes, error_message } from "$lib/core/utils";
  import { Devices as DevicesIcon, FileCsv as FileCsvIcon, FolderOpen as FolderOpenIcon, WarningCircle as WarningCircleIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { column_label, delimiter_for, parse_csv } from "./csv";
  import manifest from "./index";
  import { base_name } from "$lib/core/api/services/files/path";

  const { path: initial_path }: { path?: string } = $props();

  // Starts at the launched file; "Open…" swaps it in place. A file from the device has no path.
  let source = $state.raw<string | File | undefined>(untrack(() => initial_path));
  const path = $derived(typeof source === "string" ? source : undefined);
  let has_header = $state(true);
  /** The tapped cell, shown in full above the status bar: tooltips need a hover that touch doesn't have. */
  let inspected = $state<{ row: number; column: number; value: string } | null>(null);
  /** Rendering every row of a big file freezes the window; rows come in pages instead. */
  const ROW_PAGE = 1000;
  let shown = $state(ROW_PAGE);

  const { window: win } = get_app_context();

  function show(next: string | File) {
    source = next;
    shown = ROW_PAGE;
  }

  async function pick() {
    const chosen = await win.pick_file({ accept: manifest.associations, title: "Open in CSV Viewer" });
    if (chosen) show(chosen);
  }

  async function pick_device() {
    const [picked] = await pick_device_files({ accept: manifest.associations });
    if (picked) show(picked);
  }

  const files = $derived(kernel.service<FilesService>("files"));
  const loading = $derived(
    source
      ? (source instanceof File ? Promise.resolve(source) : files.get_file(source)).then(async (file) => {
          if (!file) return null;
          const delimiter = delimiter_for(file_extension(file.name));
          const rows = parse_csv(await file.text(), delimiter);
          const column_count = rows.reduce((max, row) => Math.max(max, row.length), 0);
          return { file, delimiter, rows, column_count };
        })
      : null
  );
  const name = $derived(source instanceof File ? source.name : (source ? base_name(source) : ""));

  $effect(() => {
    void source;
    void has_header;
    inspected = null;
  });

  function inspect(event: MouseEvent) {
    const cell = (event.target as Element).closest<HTMLElement>("[data-cell]");
    if (!cell) return;
    const [row, column] = cell.dataset.cell!.split(",").map(Number);
    inspected = inspected?.row === row && inspected.column === column ? null : { row, column, value: cell.textContent ?? "" };
  }
</script>

{#if !loading}
  <EmptyState icon={FileCsvIcon} title="No file open" description="Pick a CSV or TSV file, or open one from File Explorer.">
    {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button><Button onclick={pick_device}><DevicesIcon weight="bold" /> From device…</Button>{/snippet}
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
      <div class="grid h-full grid-rows-[auto_1fr_auto_auto]">
        <Toolbar>
          <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
          <IconButton label="Open from device…" size="sm" onclick={pick_device}><DevicesIcon weight="bold" /></IconButton>
          <span class="min-w-24 flex-1 truncate font-mono text-2xs text-foreground/80" title={path}>{path ?? name}</span>
          <label class="flex shrink-0 items-center gap-2 px-1 text-ui">
            <span class="@md:hidden">Header row</span><span class="hidden @md:inline">First row is header</span>
            <Switch bind:checked={has_header} />
          </label>
        </Toolbar>

        {#if loaded.column_count === 0}
          <EmptyState icon={FileCsvIcon} title="This file is empty" description="There are no rows to show." />
        {:else}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="min-h-0 overflow-auto" onclick={inspect}>
            <div class="w-max min-w-full font-mono text-ui">
              <div class="sticky top-0 z-10 grid h-7 items-center border-b border-foreground/8 bg-background-light font-medium" style:grid-template-columns={template}>
                <span class="sticky left-0 z-10 h-full bg-background-light"></span>
                {#each columns as column (column)}
                  {@const label = header ? (header[column] ?? "") : column_label(column)}
                  <span class="truncate px-2 text-2xs" title={label}>{label}</span>
                {/each}
              </div>
              {#each body.slice(0, shown) as row, index (index)}
                <div class="grid h-7 items-center border-b border-foreground/6 [contain-intrinsic-block-size:auto_1.75rem] [content-visibility:auto]" style:grid-template-columns={template}>
                  <span class="sticky left-0 flex h-full items-center justify-end bg-background pr-3 text-2xs text-foreground/65 tabular-nums select-none">{index + 1}</span>
                  {#each columns as column (column)}
                    <span
                      data-cell="{index},{column}"
                      class={["truncate px-2", inspected?.row === index && inspected.column === column && "bg-primary/12"]}
                      title={row[column]}>{row[column] ?? ""}</span
                    >
                  {/each}
                </div>
              {/each}
              {#if body.length > shown}
                <div class="sticky left-0 flex w-fit items-center gap-3 px-3 py-2 font-sans text-2xs text-foreground/65">
                  <Button size="sm" onclick={() => (shown += ROW_PAGE)}>Show more</Button>
                  <span>{shown} of {body.length} rows</span>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        {#if inspected}
          {@const label = header ? (header[inspected.column] ?? column_label(inspected.column)) : column_label(inspected.column)}
          <div class="flex items-start gap-2 border-t border-foreground/8 bg-background-light px-3 py-2 text-ui">
            <span class="shrink-0 font-mono text-2xs text-foreground/80 pt-0.5">{inspected.row + 1} · {label}</span>
            <span class="max-h-24 min-w-0 flex-1 overflow-y-auto font-mono break-words whitespace-pre-wrap select-text">{inspected.value || "(empty)"}</span>
          </div>
        {:else}
          <div></div>
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
    <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't read the file" description={error_message(error)} />
  {/await}
{/if}

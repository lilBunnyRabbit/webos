<script lang="ts">
  import { Button, IconButton, Switch } from "$lib/core/components/ui";
  import {
    ColumnsPlusLeft as ColumnsPlusLeftIcon,
    ColumnsPlusRight as ColumnsPlusRightIcon,
    Columns as ColumnsIcon,
    Rows as RowsIcon,
    RowsPlusBottom as RowsPlusBottomIcon,
    RowsPlusTop as RowsPlusTopIcon,
    SquareSplitHorizontal as SquareSplitHorizontalIcon,
    SquaresFour as SquaresFourIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { TableAction, type WarrenEditor } from "./editor.svelte";
  import { TABLE_PICKER, WIDTH_PRESETS, with_column_width } from "./table";

  interface Props {
    editor: WarrenEditor;
    ondone?: () => void;
  }

  let { editor, ondone }: Props = $props();

  const id = $props.id();
  let hover = $state<{ rows: number; columns: number } | null>(null);

  const keep_focus = (event: PointerEvent) => event.preventDefault();

  function insert(rows: number, columns: number) {
    editor.insert_table(rows, columns);
    hover = null;
    ondone?.();
  }

  function act(action: TableAction) {
    editor.table_action(action);
    if (action === TableAction.DELETE_TABLE) ondone?.();
  }

  function even() {
    const table = editor.table;
    if (table) editor.set_table_widths(Array.from({ length: table.columns }, () => Math.round((100 / table.columns) * 100) / 100));
  }

  const ROW_BUTTONS = [
    { action: TableAction.ROW_ABOVE, label: "Insert row above", icon: RowsPlusTopIcon },
    { action: TableAction.ROW_BELOW, label: "Insert row below", icon: RowsPlusBottomIcon },
    { action: TableAction.COLUMN_LEFT, label: "Insert column left", icon: ColumnsPlusLeftIcon },
    { action: TableAction.COLUMN_RIGHT, label: "Insert column right", icon: ColumnsPlusRightIcon },
  ];

  const percent = $derived(editor.table ? Math.round(editor.table.widths[editor.table.column_end] ?? 0) : 0);
</script>

{#if editor.table}
  {@const table = editor.table}
  <p class="font-mono text-2xs text-foreground/65 tabular-nums">
    {table.rows} × {table.columns} · row {table.row + 1}, column {table.column + 1}
  </p>
  <div class="grid grid-cols-4 gap-1" role="group" aria-label="Insert rows and columns">
    {#each ROW_BUTTONS as button (button.action)}
      <IconButton label={button.label} class="w-full" onpointerdown={keep_focus} onclick={() => act(button.action)}><button.icon weight="bold" /></IconButton>
    {/each}
  </div>
  <div class="grid grid-cols-2 gap-1">
    <Button size="sm" class="px-1" onpointerdown={keep_focus} onclick={() => act(TableAction.DELETE_ROW)}><RowsIcon weight="bold" />Delete row</Button>
    <Button size="sm" class="px-1" onpointerdown={keep_focus} onclick={() => act(TableAction.DELETE_COLUMN)}><ColumnsIcon weight="bold" />Delete column</Button>
    <Button size="sm" disabled={!table.can_merge} title={table.can_merge ? "Merge the selected cells" : "Drag across cells to select them first"} onpointerdown={keep_focus} onclick={() => act(TableAction.MERGE)}>
      <SquaresFourIcon weight="bold" />Merge cells
    </Button>
    <Button size="sm" disabled={!table.can_split} onpointerdown={keep_focus} onclick={() => act(TableAction.SPLIT)}><SquareSplitHorizontalIcon weight="bold" />Split cell</Button>
  </div>
  <label for="{id}-header" class="flex min-h-8 cursor-pointer items-center justify-between gap-2 text-ui pointer-coarse:min-h-11">
    <span>Header row <span class="block text-2xs text-foreground/65">Bold, repeated on each printed page</span></span>
    <Switch id="{id}-header" checked={table.header} onchange={(event) => editor.set_table_header(event.currentTarget.checked)} />
  </label>
  <label for="{id}-borders" class="flex min-h-8 cursor-pointer items-center justify-between gap-2 text-ui pointer-coarse:min-h-11">
    <span>Borders <span class="block text-2xs text-foreground/65">Off for layout, like a two-column CV</span></span>
    <Switch id="{id}-borders" checked={table.borders} onchange={(event) => editor.set_table_borders(event.currentTarget.checked)} />
  </label>
  {#if table.columns > 1}
    <div class="flex items-center justify-between gap-2 text-ui">
      <span>Column width</span>
      <span class="font-mono text-2xs text-foreground/65 tabular-nums">{percent}%</span>
    </div>
    <div class="grid grid-cols-6 gap-1" role="group" aria-label="Column width">
      {#each WIDTH_PRESETS as width (width)}
        <Button
          size="sm"
          variant="quiet"
          class="px-0"
          pressed={percent === width}
          onpointerdown={keep_focus}
          onclick={() => editor.set_table_widths(with_column_width(table.widths, table.column_end, width))}>{width}</Button
        >
      {/each}
      <Button size="sm" variant="quiet" class="px-0" title="Make every column the same width" onpointerdown={keep_focus} onclick={even}>Even</Button>
    </div>
    <p class="text-2xs text-foreground/65 pointer-coarse:hidden">Or drag a border between two columns.</p>
  {/if}
  <Button size="sm" variant="quiet" onpointerdown={keep_focus} onclick={() => act(TableAction.DELETE_TABLE)}><TrashIcon weight="bold" />Delete table</Button>
{:else}
  <p class="text-ui">Insert table <span class="font-mono text-2xs text-foreground/65 tabular-nums">{hover ? `${hover.rows} × ${hover.columns}` : ""}</span></p>
  <div
    class="picker grid w-fit gap-0.5"
    style="grid-template-columns: repeat({TABLE_PICKER.columns}, auto)"
    role="grid"
    aria-label="Rows and columns"
    tabindex="-1"
    onpointerleave={() => (hover = null)}
  >
    {#each { length: TABLE_PICKER.rows }, row (row)}
      {#each { length: TABLE_PICKER.columns }, column (column)}
        <button
          type="button"
          class={["cell size-5 rounded-sm ring-1 ring-foreground/20 ring-inset pointer-coarse:size-10", hover && row < hover.rows && column < hover.columns ? "bg-primary/35 ring-primary" : "bg-foreground/4"]}
          aria-label="{row + 1} by {column + 1} table"
          onpointerdown={keep_focus}
          onpointerenter={(event) => event.pointerType !== "touch" && (hover = { rows: row + 1, columns: column + 1 })}
          onfocus={() => (hover = { rows: row + 1, columns: column + 1 })}
          onclick={() => insert(row + 1, column + 1)}
        ></button>
      {/each}
    {/each}
  </div>
  <p class="text-2xs text-foreground/65">Pick the size. Pasted tab-separated text becomes a table too.</p>
{/if}

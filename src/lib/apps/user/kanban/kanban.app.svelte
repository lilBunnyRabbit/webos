<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import type { MenuItem } from "$lib/core/api/services/dialogs/type";
  import { Button, IconButton, Select, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import type { Position } from "$lib/core/utils/type";
  import {
    Archive,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowSquareOut,
    ArrowsLeftRight,
    ArrowUp,
    CheckCircle,
    Columns,
    DotsThree,
    Gauge,
    Kanban,
    PencilSimple,
    Plus,
    Trash,
    Warning,
  } from "phosphor-svelte";
  import { tick, untrack } from "svelte";
  import { z } from "zod";
  import ArchivePanel from "./archive-panel.svelte";
  import CardDetail from "./card-detail.svelte";
  import CardFace from "./card-face.svelte";
  import {
    add_board,
    add_card,
    add_column,
    archive_card,
    archive_done,
    BOARDS_FILE,
    BOARDS_PATH,
    column_index_before,
    default_file,
    delete_archived,
    done_count,
    find_card,
    get_board,
    index_before,
    is_due,
    KanbanFileSchema,
    move_card,
    move_column,
    new_board,
    new_card,
    remove_board,
    remove_card,
    remove_column,
    rename_board,
    rename_column,
    restore_card,
    set_done_column,
    set_wip,
    update_board,
    type Board,
    type Column,
  } from "./data";
  import { DragKind, BoardDrag } from "./drag.svelte";
  import KanbanColumn from "./kanban-column.svelte";
  import { day_key } from "$lib/core/utils/date";

  const { board: initial_board, card: initial_card }: { board?: string; card?: string } = $props();

  const { window: win, storage } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const data = storage.file(BOARDS_FILE, default_file(), KanbanFileSchema);
  const board_id = storage.window<string>("board", untrack(() => initial_board ?? "life"), z.string());
  const open_card = storage.window<string | null>("card", untrack(() => initial_card ?? null), z.string().nullable());
  const archive_open = storage.window<boolean>("archive", false, z.boolean());

  const board = $derived(get_board(data.value, board_id.value));
  let composing = $state<string | null>(null);
  let today = $state(day_key());
  let scroller = $state<HTMLElement | null>(null);
  let root = $state<HTMLElement | null>(null);

  $effect(() => {
    const timer = setInterval(() => (today = day_key()), 60_000);
    return () => clearInterval(timer);
  });

  // A `card` prop (Calendar, a link) may point into another board than the one this window shows.
  $effect(() => {
    const id = open_card.value;
    if (!data.ready || !id || find_card(board, id)) return;
    const owner = data.value.boards.find((candidate) => find_card(candidate, id));
    untrack(() => {
      if (owner) board_id.value = owner.id;
      else open_card.value = null;
    });
  });

  const edit = (update: (board: Board) => Board) => {
    data.value = update_board(data.value, board.id, update);
  };

  const drag = new BoardDrag((kind, id, target) => {
    if (kind === DragKind.CARD && target.column) {
      const column = board.columns.find((candidate) => candidate.id === target.column);
      if (column) edit((board) => move_card(board, id, column.id, index_before(column, target.before, id)));
    } else if (kind === DragKind.COLUMN) {
      edit((board) => move_column(board, id, column_index_before(board, target.before, id)));
    }
  });

  $effect(() => {
    drag.root = root;
    drag.scroller = scroller;
  });

  $effect(() => () => drag.end(false));

  const column_marker = $derived.by(() => {
    if (drag.kind !== DragKind.COLUMN || !drag.target) return null;
    const ids = board.columns.map((column) => column.id);
    const from = ids.indexOf(drag.id!);
    const before = drag.target.before;
    if (before === (ids[from + 1] ?? null)) return null;
    return before;
  });

  const total = $derived(board.columns.reduce((sum, column) => sum + column.cards.length, 0));
  const due = $derived(board.columns.filter((column) => !column.done).reduce((sum, column) => sum + column.cards.filter((card) => is_due(card, today)).length, 0));
  const finished = $derived(done_count(board));

  $effect(() => win.set_title(data.value.boards.length > 1 ? board.name : null));

  $effect(() =>
    win.on_back(() => {
      if (open_card.value) open_card.value = null;
      else if (archive_open.value) archive_open.value = false;
      else return false;
      return true;
    })
  );

  async function focus_card(id: string) {
    await tick();
    root?.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"] button`)?.focus();
  }

  function open(id: string) {
    archive_open.value = false;
    open_card.value = id;
  }

  function first_open_column(): Column | undefined {
    return board.columns.find((column) => !column.done) ?? board.columns[0];
  }

  async function compose(column_id: string | null) {
    composing = column_id;
    if (!column_id) return;
    await tick();
    root?.querySelector(`[data-column="${CSS.escape(column_id)}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }

  function key_move(card_id: string, dx: number, dy: number) {
    const found = find_card(board, card_id);
    if (!found) return;
    const columns = board.columns;
    const column_index = columns.findIndex((column) => column.id === found.column.id);
    const to = columns[column_index + dx];
    if (!to) return;
    const index = dx === 0 ? found.index + dy : Math.min(found.index, to.cards.length);
    if (dx === 0 && (index < 0 || index >= found.column.cards.length)) return;
    edit((board) => move_card(board, card_id, to.id, index));
    void focus_card(card_id);
  }

  async function delete_card(card_id: string) {
    const found = find_card(board, card_id);
    if (!found) return;
    const ok = await win.confirm(`Delete “${found.card.title || "Untitled"}”?`, {
      detail: "Archive it instead to keep it out of the way without losing it.",
      confirm_label: "Delete",
      danger: true,
    });
    if (!ok) return;
    if (open_card.value === card_id) open_card.value = null;
    edit((board) => remove_card(board, card_id));
  }

  function archive(card_id: string) {
    if (open_card.value === card_id) open_card.value = null;
    edit((board) => archive_card(board, card_id));
  }

  async function card_menu(card_id: string, anchor: Position) {
    const found = find_card(board, card_id);
    if (!found) return;
    const { column, index } = found;
    const choice = await dialogs.menu(
      [
        { id: "open", label: "Open", icon: ArrowSquareOut },
        {
          label: "Move to",
          icon: ArrowsLeftRight,
          items: board.columns.map((other) => ({ id: `move:${other.id}`, label: other.name, disabled: other.id === column.id })),
        },
        { id: "up", label: "Move up", icon: ArrowUp, shortcut: "Alt+↑", disabled: index === 0 },
        { id: "down", label: "Move down", icon: ArrowDown, shortcut: "Alt+↓", disabled: index === column.cards.length - 1 },
        { separator: true },
        { id: "archive", label: "Archive", icon: Archive },
        { id: "delete", label: "Delete", icon: Trash, danger: true },
      ],
      { anchor }
    );
    if (choice === "open") open(card_id);
    else if (choice?.startsWith("move:")) {
      edit((board) => move_card(board, card_id, choice.slice(5), Infinity));
      void focus_card(card_id);
    } else if (choice === "up") key_move(card_id, 0, -1);
    else if (choice === "down") key_move(card_id, 0, 1);
    else if (choice === "archive") archive(card_id);
    else if (choice === "delete") await delete_card(card_id);
  }

  async function ask_wip(column: Column) {
    const value = await win.prompt(`Limit for “${column.name}”`, {
      detail: "How many cards fit here at once. Going over shows a warning; leave it empty for no limit.",
      initial: column.wip?.toString() ?? "",
      placeholder: "No limit",
      confirm_label: "Set",
      validate: (text) => (text.trim() === "" || /^\d+$/.test(text.trim()) ? null : "A whole number, or empty"),
    });
    if (value === null) return;
    edit((board) => set_wip(board, column.id, value.trim() ? Number(value) : null));
  }

  async function column_menu(column: Column, anchor: Position) {
    const index = board.columns.findIndex((other) => other.id === column.id);
    const choice = await dialogs.menu(
      [
        { id: "add", label: "Add card", icon: Plus },
        { separator: true },
        { id: "rename", label: "Rename…", icon: PencilSimple },
        { id: "wip", label: column.wip === null ? "Set a limit…" : `Limit: ${column.wip}…`, icon: Gauge },
        { id: "done", label: column.done ? "Not a done column" : "Mark as done column", icon: CheckCircle },
        { id: "left", label: "Move left", icon: ArrowLeft, disabled: index === 0 },
        { id: "right", label: "Move right", icon: ArrowRight, disabled: index === board.columns.length - 1 },
        ...(column.done && column.cards.length > 0 ? [{ id: "archive", label: `Archive ${column.cards.length} done`, icon: Archive }] : []),
        { separator: true },
        { id: "delete", label: "Delete column", icon: Trash, danger: true },
      ] satisfies MenuItem[],
      { anchor }
    );
    if (choice === "add") await compose(column.id);
    else if (choice === "rename") {
      const name = await win.prompt("Rename column", { initial: column.name, confirm_label: "Rename" });
      if (name?.trim()) edit((board) => rename_column(board, column.id, name.trim()));
    } else if (choice === "wip") await ask_wip(column);
    else if (choice === "done") edit((board) => set_done_column(board, column.id, !column.done));
    else if (choice === "left") edit((board) => move_column(board, column.id, index - 1));
    else if (choice === "right") edit((board) => move_column(board, column.id, index + 1));
    else if (choice === "archive") edit((board) => archive_done(board));
    else if (choice === "delete") await delete_column(column);
  }

  async function delete_column(column: Column) {
    if (column.cards.length > 0) {
      const ok = await win.confirm(`Delete “${column.name}” and its ${column.cards.length} ${column.cards.length === 1 ? "card" : "cards"}?`, {
        detail: "The cards are deleted too. Move them out first to keep them.",
        confirm_label: "Delete",
        danger: true,
      });
      if (!ok) return;
    }
    if (open_card.value && column.cards.some((card) => card.id === open_card.value)) open_card.value = null;
    edit((board) => remove_column(board, column.id));
  }

  async function new_column() {
    const name = await win.prompt("New column", { placeholder: "Waiting, Someday…", confirm_label: "Add" });
    if (name?.trim()) edit((board) => add_column(board, name.trim()));
  }

  async function board_menu(anchor: Position) {
    const choice = await dialogs.menu(
      [
        { id: "new", label: "New board…", icon: Kanban },
        { id: "rename", label: "Rename board…", icon: PencilSimple },
        { id: "column", label: "Add column…", icon: Columns },
        { id: "archive", label: finished ? `Archive ${finished} done` : "Archive done cards", icon: Archive, disabled: finished === 0 },
        { separator: true },
        { id: "delete", label: "Delete board", icon: Trash, danger: true, disabled: data.value.boards.length <= 1 },
      ],
      { anchor }
    );
    if (choice === "new") {
      const name = await win.prompt("New board", { placeholder: "Trip, Move, Garden…", confirm_label: "Create" });
      if (!name?.trim()) return;
      const created = new_board(name.trim());
      data.value = add_board(data.value, created);
      board_id.value = created.id;
      open_card.value = null;
    } else if (choice === "rename") {
      const name = await win.prompt("Rename board", { initial: board.name, confirm_label: "Rename" });
      if (name?.trim()) data.value = rename_board(data.value, board.id, name.trim());
    } else if (choice === "column") await new_column();
    else if (choice === "archive") edit((board) => archive_done(board));
    else if (choice === "delete") {
      const ok = await win.confirm(`Delete the board “${board.name}”?`, {
        detail: `Its ${total} ${total === 1 ? "card" : "cards"} and its archive are deleted too.`,
        confirm_label: "Delete",
        danger: true,
      });
      if (!ok) return;
      data.value = remove_board(data.value, board.id);
      board_id.value = data.value.boards[0].id;
      open_card.value = null;
    }
  }

  const below = (event: MouseEvent): Position => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: rect.left, y: rect.bottom + 4 };
  };

  const board_options = $derived(data.value.boards.map((candidate) => ({ value: candidate.id, label: candidate.name })));
  const ghost_card = $derived(drag.kind === DragKind.CARD && drag.id ? find_card(board, drag.id) : null);
  const ghost_column = $derived(drag.kind === DragKind.COLUMN ? board.columns.find((column) => column.id === drag.id) : undefined);
  const panel = $derived(open_card.value && find_card(board, open_card.value) ? "card" : archive_open.value ? "archive" : null);
</script>

<div bind:this={root} class="@container relative grid h-full grid-cols-1 grid-rows-[auto_auto_1fr_auto]">
  <Toolbar>
    <Select
      size="sm"
      class="w-auto max-w-40 @md:max-w-56"
      aria-label="Board"
      options={board_options}
      bind:value={() => board.id, (id) => {
        board_id.value = id;
        open_card.value = null;
        composing = null;
      }}
    />
    <IconButton label="Board actions" size="sm" onclick={(event) => board_menu(below(event))}><DotsThree weight="bold" /></IconButton>
    <span class="flex-1"></span>
    <Button variant="quiet" size="sm" pressed={panel === "archive"} title="Archived cards" aria-label="Archive ({board.archive.length})" onclick={() => {
      open_card.value = null;
      archive_open.value = !archive_open.value;
    }}>
      <Archive /><span class="hidden @md:inline">Archive</span>
      {#if board.archive.length > 0}<span class="font-mono text-2xs tabular-nums">{board.archive.length}</span>{/if}
    </Button>
    <Button variant="primary" size="sm" disabled={!data.ready || board.columns.length === 0} onclick={() => compose(first_open_column()?.id ?? null)}>
      <Plus weight="bold" /><span class="hidden @sm:inline">Add card</span>
    </Button>
  </Toolbar>

  {#if data.error}
    <div class="flex items-center gap-2 border-b border-foreground/8 bg-warning/10 px-3 py-2 text-ui">
      <Warning class="size-4 shrink-0 text-warning" weight="fill" />
      <span class="min-w-0 flex-1">Couldn't read your boards ({data.error}). The next change replaces the file.</span>
    </div>
  {:else}
    <div></div>
  {/if}

  <div class="relative min-h-0">
    {#if !data.ready}
      <div class="grid h-full place-items-center"><Spinner label="Loading boards" /></div>
    {:else}
      <div
        bind:this={scroller}
        class={cn(
          "flex h-full items-start gap-3 overflow-x-auto overscroll-x-contain p-3 [scrollbar-width:thin]",
          "snap-x snap-mandatory scroll-px-4 px-4 @md:snap-none @md:px-3",
          panel && "max-@3xl:invisible"
        )}
      >
        {#each board.columns as column (column.id)}
          <div class="relative flex h-full shrink-0 snap-center items-start">
            {#if column_marker === column.id}<span class="absolute inset-y-2 -left-2 w-0.5 rounded-full bg-primary" aria-hidden="true"></span>{/if}
            <KanbanColumn
              {column}
              labels={board.labels}
              {today}
              {drag}
              composing={composing === column.id}
              oncompose={(open) => (composing = open ? column.id : null)}
              onadd={(title) => edit((board) => add_card(board, column.id, new_card(title)))}
              onopen={open}
              oncardmenu={card_menu}
              onmenu={(point) => column_menu(column, point)}
              onkeymove={key_move}
            />
          </div>
        {/each}
        <div class="relative flex shrink-0 snap-center">
          {#if column_marker === null && drag.kind === DragKind.COLUMN}<span class="absolute inset-y-2 -left-2 w-0.5 rounded-full bg-primary" aria-hidden="true"></span>{/if}
          <Button variant="quiet" size="md" class="w-[calc(100cqw-3rem)] justify-start bg-foreground/4 text-foreground/65 @md:w-72" onclick={new_column}>
            <Plus weight="bold" />Add column
          </Button>
        </div>
      </div>

      {#if panel}
        <aside
          class="absolute inset-0 z-10 bg-background @3xl:left-auto @3xl:w-[26rem] @3xl:border-l @3xl:border-foreground/8 @3xl:shadow-popover"
          aria-label={panel === "card" ? "Card" : "Archive"}
        >
          {#if panel === "card" && open_card.value}
            {#key open_card.value}
              <CardDetail
                {board}
                card_id={open_card.value}
                {today}
                {edit}
                onclose={() => (open_card.value = null)}
                onarchive={() => archive(open_card.value!)}
                ondelete={() => delete_card(open_card.value!)}
              />
            {/key}
          {:else}
            <ArchivePanel
              {board}
              {today}
              onclose={() => (archive_open.value = false)}
              onrestore={(id) => edit((board) => restore_card(board, id))}
              ondelete={async (id) => {
                const ok = await win.confirm(id === null ? "Empty the archive?" : "Delete this card for good?", {
                  detail: id === null ? `${board.archive.length} archived cards are deleted.` : "It can't be restored afterwards.",
                  confirm_label: "Delete",
                  danger: true,
                });
                if (ok) edit((board) => delete_archived(board, id));
              }}
            />
          {/if}
        </aside>
      {/if}
    {/if}
  </div>

  <StatusBar>
    <span>{total} {total === 1 ? "card" : "cards"}</span>
    <span class={cn(due > 0 && "text-warning")}>{due} due</span>
    <span>{board.archive.length} archived</span>
    <span class="hidden @lg:inline">{BOARDS_PATH}</span>
    <span class="ml-auto hidden @2xl:inline">Drag to move · Alt+arrows on a card</span>
  </StatusBar>

  {#if drag.ghost}
    <div
      class="pointer-events-none absolute top-0 left-0 z-30 rotate-2"
      style:translate="{drag.ghost.x}px {drag.ghost.y}px"
      style:width="{drag.ghost.width}px"
      aria-hidden="true"
    >
      {#if ghost_card}
        <div class="rounded-lg bg-background-lighter p-2.5 shadow-popover ring-1 ring-primary/40">
          <CardFace card={ghost_card.card} labels={board.labels} {today} done={ghost_card.column.done} />
        </div>
      {:else if ghost_column}
        <div class="flex h-11 items-center gap-2 rounded-xl bg-background-lighter px-3 shadow-popover ring-1 ring-primary/40">
          <span class="truncate text-ui font-semibold">{ghost_column.name}</span>
          <span class="font-mono text-2xs text-foreground/65">{ghost_column.cards.length}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

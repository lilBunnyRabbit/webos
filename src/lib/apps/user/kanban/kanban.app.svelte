<script lang="ts">
  import kernel, { NotificationType, type AppsService, type DialogsService, type FilesService, type NotificationsService } from "$lib/core/api";
  import { base_name, join_path, split_path } from "$lib/core/api/services/files/path";
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
    FolderOpen,
    Gauge,
    GearSix,
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
    move_outcome,
    move_column,
    new_board,
    new_card,
    new_folder_board,
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
    type MoveOutcome,
  } from "./data";
  import { DragKind, BoardDrag } from "./drag.svelte";
  import FolderSettings from "./folder-settings.svelte";
  import { card_fields, folder_board, NO_VALUE, pin_columns, type NoteCard } from "./folder";
  import { create_note, FolderReader, write_card_field } from "./folder-store";
  import KanbanColumn from "./kanban-column.svelte";
  import { first_open_column } from "./lookup";
  import { day_key } from "$lib/core/utils/date";
  import { Ticker } from "$lib/core/utils/ticker.svelte";

  const { board: initial_board, card: initial_card }: { board?: string; card?: string } = $props();

  const { window: win, storage, app_id, achievements } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const files = $derived(kernel.service<FilesService>("files"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const data = storage.file(BOARDS_FILE, default_file(), KanbanFileSchema);
  const cards_done = storage.persisted("finished", 0, z.number().int().nonnegative());
  const board_id = storage.window<string>("board", untrack(() => initial_board ?? "life"), z.string());
  const open_card = storage.window<string | null>("card", untrack(() => initial_card ?? null), z.string().nullable());
  const archive_open = storage.window<boolean>("archive", false, z.boolean());
  const settings_open = storage.window<boolean>("folder-settings", false, z.boolean());

  const stored = $derived(get_board(data.value, board_id.value));
  const folder = $derived(stored.folder ?? null);

  let notes = $state.raw<NoteCard[]>([]);
  let notes_path = $state<string | null>(null);
  let folder_missing = $state(false);
  const reader = new FolderReader(() => files);
  let reload_id = 0;

  async function reload(path: string) {
    const id = ++reload_id;
    try {
      const listed = await reader.list(path);
      if (id !== reload_id) return;
      folder_missing = listed === null;
      notes = listed ?? [];
    } catch (reason) {
      if (id === reload_id) notifications.notify(app_id, { type: NotificationType.ERROR, title: `Couldn't read ${path}`, message: String(reason) });
    } finally {
      if (id === reload_id) notes_path = path;
    }
  }

  // Focus re-lists too: edits made outside the browser, in a mounted folder (ADR-044), bump no revision.
  $effect(() => {
    const path = folder?.path;
    if (!path) return;
    files.revision(path);
    if (!win.is_focused) return;
    untrack(() => reload(path));
  });

  const folder_ready = $derived(!folder || notes_path === folder.path);
  const board = $derived(folder ? folder_board(stored, folder, folder_ready ? notes : []) : stored);
  const note_by_file = $derived(new Map(notes.map((note) => [note.file, note])));
  const fields_of = (file: string) => {
    const note = note_by_file.get(file);
    return note && folder ? card_fields(note, folder.show) : [];
  };
  let composing = $state<string | null>(null);
  const clock = new Ticker(() => win.is_visible, 60_000);
  const today = $derived(day_key(new Date(clock.now)));
  let scroller = $state<HTMLElement | null>(null);
  let root = $state<HTMLElement | null>(null);

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

  const edit_columns = (update: (board: Board) => Board) => edit((current) => update(folder ? pin_columns(current, board) : current));

  async function move_note(file: string, value: string) {
    if (!folder) return;
    const { path, field } = folder;
    const note = note_by_file.get(file);
    if (!note || (note.fields[field] ?? "") === value) return;
    const outcome = move_outcome(board, file, value);
    // Order of first appearance follows the files, so a move would reshuffle the columns: it freezes the order first.
    if (board.columns.some((column) => column.id !== NO_VALUE && !stored.columns.some((other) => other.id === column.id))) edit_columns((board) => board);
    notes = notes.map((other) => (other.file === file ? { ...other, fields: { ...other.fields, [field]: value } } : other));
    try {
      await write_card_field(files, path, file, field, value);
      report_move(outcome);
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: `Couldn't move “${note.title}”`, message: String(reason) });
      void reload(path);
    }
  }

  async function add_note(title: string, value: string) {
    if (!folder) return;
    const { path, field, template } = folder;
    try {
      await create_note(files, path, { title, field, value, template });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't add the card", message: String(reason) });
    }
  }

  function report_move(outcome: MoveOutcome) {
    if (!outcome.finished) return;
    cards_done.value += 1;
    achievements.achieve("first-done");
    achievements.progress("done-50", cards_done.value);
    if (outcome.cleared) achievements.achieve("cleared");
  }

  const drag = new BoardDrag((kind, id, target) => {
    if (kind === DragKind.CARD && target.column) {
      const column = board.columns.find((candidate) => candidate.id === target.column);
      if (column && folder) void move_note(id, column.id);
      else if (column) {
        report_move(move_outcome(board, id, column.id));
        edit((board) => move_card(board, id, column.id, index_before(column, target.before, id)));
      }
    } else if (kind === DragKind.COLUMN && id !== NO_VALUE) {
      edit_columns((board) => move_column(board, id, column_index_before(board, target.before, id)));
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
      else if (settings_open.value) settings_open.value = false;
      else return false;
      return true;
    })
  );

  async function focus_card(id: string) {
    await tick();
    root?.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"] button`)?.focus();
  }

  function open(id: string) {
    if (folder) {
      apps.launch("text-editor", { path: join_path(split_path(folder.path), id) });
      return;
    }
    archive_open.value = false;
    settings_open.value = false;
    open_card.value = id;
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
    if (folder) {
      if (dx === 0 || to.id === NO_VALUE) return;
      void move_note(card_id, to.id).then(() => focus_card(card_id));
      return;
    }
    const index = dx === 0 ? found.index + dy : Math.min(found.index, to.cards.length);
    if (dx === 0 && (index < 0 || index >= found.column.cards.length)) return;
    report_move(move_outcome(board, card_id, to.id));
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
    if (folder) {
      const choice = await dialogs.menu(
        [
          { id: "open", label: "Open in Text Editor", icon: ArrowSquareOut },
          {
            label: "Move to",
            icon: ArrowsLeftRight,
            items: board.columns
              .filter((other) => other.id !== NO_VALUE)
              .map((other) => ({ id: `move:${other.id}`, label: other.name, disabled: other.id === column.id })),
          },
        ],
        { anchor }
      );
      if (choice === "open") open(card_id);
      else if (choice?.startsWith("move:")) await move_note(card_id, choice.slice(5));
      return;
    }
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
      report_move(move_outcome(board, card_id, choice.slice(5)));
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
    edit_columns((board) => set_wip(board, column.id, value.trim() ? Number(value) : null));
  }

  async function column_menu(column: Column, anchor: Position) {
    const index = board.columns.findIndex((other) => other.id === column.id);
    if (column.id === NO_VALUE) {
      if ((await dialogs.menu([{ id: "add", label: "Add card", icon: Plus }], { anchor })) === "add") await compose(column.id);
      return;
    }
    const last = board.columns.filter((other) => other.id !== NO_VALUE).length - 1;
    const choice = await dialogs.menu(
      [
        { id: "add", label: "Add card", icon: Plus },
        { separator: true },
        ...(folder ? [] : [{ id: "rename", label: "Rename…", icon: PencilSimple }]),
        { id: "wip", label: column.wip === null ? "Set a limit…" : `Limit: ${column.wip}…`, icon: Gauge },
        { id: "done", label: column.done ? "Not a done column" : "Mark as done column", icon: CheckCircle },
        { id: "left", label: "Move left", icon: ArrowLeft, disabled: index === 0 },
        { id: "right", label: "Move right", icon: ArrowRight, disabled: index >= last },
        ...(!folder && column.done && column.cards.length > 0 ? [{ id: "archive", label: `Archive ${column.cards.length} done`, icon: Archive }] : []),
        ...(folder ? [] : [{ separator: true } as const, { id: "delete", label: "Delete column", icon: Trash, danger: true }]),
      ] satisfies MenuItem[],
      { anchor }
    );
    if (choice === "add") await compose(column.id);
    else if (choice === "rename") {
      const name = await win.prompt("Rename column", { initial: column.name, confirm_label: "Rename" });
      if (name?.trim()) edit((board) => rename_column(board, column.id, name.trim()));
    } else if (choice === "wip") await ask_wip(column);
    else if (choice === "done") edit_columns((board) => set_done_column(board, column.id, !column.done));
    else if (choice === "left") edit_columns((board) => move_column(board, column.id, index - 1));
    else if (choice === "right") edit_columns((board) => move_column(board, column.id, index + 1));
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
    if (folder) {
      const value = await win.prompt("New column", {
        detail: `A value of “${folder.field}”. Cards dropped here get it.`,
        confirm_label: "Add",
        validate: (text) => (board.columns.some((column) => column.id === text.trim()) ? "That column is already there" : null),
      });
      if (value?.trim()) edit_columns((board) => add_column(board, value.trim(), value.trim()));
      return;
    }
    const name = await win.prompt("New column", { placeholder: "Waiting, Someday…", confirm_label: "Add" });
    if (name?.trim()) edit((board) => add_column(board, name.trim()));
  }

  function show_board(id: string) {
    board_id.value = id;
    open_card.value = null;
    archive_open.value = false;
    settings_open.value = false;
    composing = null;
  }

  async function board_menu(anchor: Position) {
    const choice = await dialogs.menu(
      [
        { id: "new", label: "New board…", icon: Kanban },
        { id: "folder-board", label: "New board from a folder…", icon: FolderOpen },
        { id: "rename", label: "Rename board…", icon: PencilSimple },
        ...(folder ? [{ id: "settings", label: "Folder settings…", icon: GearSix }] : []),
        { id: "column", label: "Add column…", icon: Columns },
        ...(folder
          ? []
          : [{ id: "archive", label: finished ? `Archive ${finished} done` : "Archive done cards", icon: Archive, disabled: finished === 0 }]),
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
      show_board(created.id);
    } else if (choice === "folder-board") {
      const path = await win.pick_directory({ title: "Folder of markdown files" });
      if (!path) return;
      const created = new_folder_board(base_name(path) || path, path);
      data.value = add_board(data.value, created);
      show_board(created.id);
    } else if (choice === "settings") {
      open_card.value = null;
      archive_open.value = false;
      settings_open.value = true;
    } else if (choice === "rename") {
      const name = await win.prompt("Rename board", { initial: board.name, confirm_label: "Rename" });
      if (name?.trim()) data.value = rename_board(data.value, board.id, name.trim());
    } else if (choice === "column") await new_column();
    else if (choice === "archive") edit((board) => archive_done(board));
    else if (choice === "delete") {
      const ok = await win.confirm(`Delete the board “${board.name}”?`, {
        detail: folder ? `Its files stay in ${folder.path}.` : `Its ${total} ${total === 1 ? "card" : "cards"} and its archive are deleted too.`,
        confirm_label: "Delete",
        danger: true,
      });
      if (!ok) return;
      data.value = remove_board(data.value, board.id);
      show_board(data.value.boards[0].id);
    }
  }

  const below = (event: MouseEvent): Position => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: rect.left, y: rect.bottom + 4 };
  };

  const board_options = $derived(data.value.boards.map((candidate) => ({ value: candidate.id, label: candidate.name })));
  const ghost_card = $derived(drag.kind === DragKind.CARD && drag.id ? find_card(board, drag.id) : null);
  const ghost_column = $derived(drag.kind === DragKind.COLUMN ? board.columns.find((column) => column.id === drag.id) : undefined);
  const panel = $derived.by(() => {
    if (folder) return settings_open.value ? "settings" : null;
    if (open_card.value && find_card(board, open_card.value)) return "card";
    return archive_open.value ? "archive" : null;
  });
</script>

<div bind:this={root} class="@container relative grid h-full grid-cols-1 grid-rows-[auto_auto_1fr_auto]">
  <Toolbar>
    <Select
      size="sm"
      class="w-auto max-w-40 @md:max-w-56"
      aria-label="Board"
      options={board_options}
      bind:value={() => board.id, show_board}
    />
    <IconButton label="Board actions" size="sm" onclick={(event) => board_menu(below(event))}><DotsThree weight="bold" /></IconButton>
    <span class="flex-1"></span>
    {#if !folder}<Button variant="quiet" size="sm" pressed={panel === "archive"} title="Archived cards" aria-label="Archive ({board.archive.length})" onclick={() => {
      open_card.value = null;
      archive_open.value = !archive_open.value;
    }}>
      <Archive /><span class="hidden @md:inline">Archive</span>
      {#if board.archive.length > 0}<span class="font-mono text-2xs tabular-nums">{board.archive.length}</span>{/if}
    </Button>{/if}
    <Button variant="primary" size="sm" disabled={!data.ready || board.columns.length === 0} onclick={() => compose(first_open_column(board)?.id ?? null)}>
      <Plus weight="bold" /><span class="hidden @sm:inline">Add card</span>
    </Button>
  </Toolbar>

  {#if folder && folder_missing}
    <div class="flex items-center gap-2 border-b border-foreground/8 bg-warning/10 px-3 py-2 text-ui">
      <Warning class="size-4 shrink-0 text-warning" weight="fill" />
      <span class="min-w-0 flex-1">Couldn't open {folder.path}. A mounted folder may need reconnecting in Files.</span>
      <Button variant="quiet" size="sm" onclick={() => (settings_open.value = true)}>Change…</Button>
    </div>
  {:else if data.error}
    <div class="flex items-center gap-2 border-b border-foreground/8 bg-warning/10 px-3 py-2 text-ui">
      <Warning class="size-4 shrink-0 text-warning" weight="fill" />
      <span class="min-w-0 flex-1">Couldn't read your boards ({data.error}). The next change replaces the file.</span>
    </div>
  {:else}
    <div></div>
  {/if}

  <div class="relative min-h-0">
    {#if !data.ready || !folder_ready}
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
              onadd={(title) => (folder ? void add_note(title, column.id) : edit((board) => add_card(board, column.id, new_card(title))))}
              onopen={open}
              oncardmenu={card_menu}
              onmenu={(point) => column_menu(column, point)}
              onkeymove={key_move}
              fields={folder ? fields_of : undefined}
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
          aria-label={panel === "card" ? "Card" : panel === "settings" ? "Folder settings" : "Archive"}
        >
          {#if panel === "settings" && folder}
            {#key board.id}
              <FolderSettings {board} {folder} {edit} onclose={() => (settings_open.value = false)} />
            {/key}
          {:else if panel === "card" && open_card.value}
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
    {#if !folder}<span>{board.archive.length} archived</span>{/if}
    <span class="hidden min-w-0 truncate @lg:inline">{folder?.path ?? BOARDS_PATH}</span>
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
          <CardFace card={ghost_card.card} labels={board.labels} {today} done={ghost_card.column.done} fields={folder ? fields_of(ghost_card.card.id) : []} />
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

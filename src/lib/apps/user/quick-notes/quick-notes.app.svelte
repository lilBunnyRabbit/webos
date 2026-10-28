<script lang="ts">
  import kernel, { NotificationType, Platform, type AppsService, type DesktopItem, type DesktopService, type DialogsService, type FilesService, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import { format_keys } from "$lib/core/api/services/shortcuts/keys";
  import { Badge, Button, Checkbox, EmptyState, IconButton, Input, Segmented, Select, StatusBar, Textarea, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn, format_date, format_datetime } from "$lib/core/utils";
  import { ArrowLeft, ArrowSquareOut, Check, CheckSquare, Notepad, Plus, Sticker, Trash, Tray, X, XCircle } from "phosphor-svelte";
  import { long_press } from "$lib/core/utils/long-press";
  import { tick, untrack } from "svelte";
  import { z } from "zod";
  import {
    add_todo,
    clear_todos,
    NOTE_STATUSES,
    NOTES_DIR,
    NoteStatus,
    parse_todos,
    remove_todo,
    set_todo,
    tags_of,
    title_of,
    newest_first,
    backlinks_of,
    links_of,
    resolve_link,
    type Note,
  } from "./notes";
  import { create_note, delete_note, NotesReader, read_todo, save_note, write_todo } from "./store";
  import { NoteDraft } from "./draft.svelte";

  const { note: initial_note, tab: initial_tab }: { note?: string; tab?: "inbox" | "notes" | "todo" } = $props();

  const { app_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const capture_keys = $derived.by(() => {
    const shortcut = shortcuts.list().find((shortcut) => shortcut.id === "apps.quick_note");
    return shortcut ? format_keys(shortcut.keys, shortcuts.mac).join(shortcuts.mac ? "" : "+") : null;
  });

  const Tab = { INBOX: "inbox", NOTES: "notes", TODO: "todo" } as const;
  type Tab = (typeof Tab)[keyof typeof Tab];
  const tab = storage.window<Tab>("tab", untrack(() => initial_tab ?? (initial_note ? Tab.NOTES : Tab.INBOX)), z.enum(Tab));
  const selected_id = storage.window<string | null>("note", untrack(() => initial_note ?? null), z.string().nullable());
  const filter_status = storage.persisted<NoteStatus>("notes-status", NoteStatus.READY, z.enum(NoteStatus));

  let notes = $state.raw<Note[]>([]);
  let todo_text = $state("");
  let loaded = $state(false);
  let query = $state("");
  let capture_text = $state("");
  let editor = $state<HTMLTextAreaElement | null>(null);

  const reader = new NotesReader(() => files);
  let reload_id = 0;

  async function reload() {
    const id = ++reload_id;
    try {
      const [next_notes, next_todo] = await Promise.all([reader.list(), read_todo(files)]);
      if (id !== reload_id) return;
      notes = next_notes.sort(newest_first);
      todo_text = next_todo;
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't read your notes", message: String(reason) });
    } finally {
      if (id === reload_id) loaded = true;
    }
  }

  $effect(() => {
    files.revision(NOTES_DIR);
    untrack(reload);
  });

  // `note=<id prefix>` from the shell or a link: resolve to the full id once the notes are in.
  $effect(() => {
    const id = selected_id.value;
    if (!loaded || !id || notes.some((note) => note.id === id)) return;
    const match = notes.find((note) => note.id.startsWith(id));
    untrack(() => (selected_id.value = match?.id ?? null));
  });

  const selected = $derived(notes.find((note) => note.id === selected_id.value) ?? null);
  const inbox = $derived(notes.filter((note) => note.status === NoteStatus.RAW));
  const todos = $derived(parse_todos(todo_text));
  const open_todos = $derived(todos.filter((todo) => !todo.done).length);

  function matches(note: Note): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    if (q.startsWith("#")) return tags_of(note.body).includes(q.slice(1));
    return note.id.startsWith(q) || note.body.toLowerCase().includes(q);
  }

  const visible = $derived(
    (tab.value === Tab.INBOX ? inbox : notes.filter((note) => note.status === filter_status.value)).filter(matches)
  );

  async function persist(note: Note): Promise<boolean> {
    try {
      await save_note(files, note);
      return true;
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't save the note", message: String(reason) });
      return false;
    }
  }

  const draft = new NoteDraft(() => selected, persist);

  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  /** Widgets only show on the desktop shell for now (ADR-034). */
  const can_pin = kernel.platform !== Platform.MOBILE;

  /** This app's widget on the desktop showing `note`, or the todo list when `note` is null. */
  function widget_for(note: string | null) {
    return desktop
      .items()
      .find((item): item is Extract<DesktopItem, { kind: "widget" }> => item.kind === "widget" && item.app_id === app_id && (item.props?.note ?? null) === note);
  }

  /** Adds the widget, or takes it off the desktop when it's already there. */
  async function toggle_widget(note: Note | null) {
    const existing = widget_for(note?.id ?? null);
    try {
      if (existing) {
        await desktop.remove_item(existing.name);
        notifications.notify(app_id, { type: NotificationType.INFO, title: "Removed from the desktop", message: existing.label });
        return;
      }
      const shell = await import("./shell");
      const name = note ? await shell.pin_note(note.id === selected?.id ? { ...note, body: draft.body } : note) : await shell.pin_todos();
      notifications.notify(app_id, {
        type: NotificationType.INFO,
        title: note ? "Sticky added to the desktop" : "Todo list added to the desktop",
        message: `${name.replace(/\.widget$/, "")}: edit it right there, drag it by its title.`,
      });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't change the desktop", message: String(reason) });
    }
  }

  async function note_menu(note: Note, anchor: { x: number; y: number }) {
    const on_desktop = widget_for(note.id) !== undefined;
    const choice = await dialogs.menu(
      [
        { id: "open", label: "Open", icon: ArrowSquareOut },
        ...(can_pin
          ? [
              { separator: true } as const,
              { id: "widget", label: on_desktop ? "Remove sticky from desktop" : "Show as sticky on desktop", icon: Sticker },
            ]
          : []),
        { separator: true },
        ...(note.status !== NoteStatus.READY ? [{ id: NoteStatus.READY, label: "Mark ready", icon: Check }] : []),
        ...(note.status !== NoteStatus.DONE ? [{ id: NoteStatus.DONE, label: "Mark done", icon: CheckSquare }] : []),
        ...(note.status !== NoteStatus.DROPPED ? [{ id: NoteStatus.DROPPED, label: "Drop", icon: XCircle }] : []),
        { separator: true },
        { id: "delete", label: "Delete", icon: Trash, danger: true },
      ],
      { anchor }
    );
    if (choice === "open") selected_id.value = note.id;
    else if (choice === "widget") await toggle_widget(note);
    else if (choice === "delete") await remove(note);
    else if (choice && (NOTE_STATUSES as string[]).includes(choice)) await set_status(note, choice as NoteStatus);
  }
  $effect(() => () => draft.cancel());

  async function set_status(note: Note, status: NoteStatus) {
    draft.cancel();
    await persist({ ...note, body: draft.body, status });
  }

  async function remove(note: Note) {
    if (!(await win.confirm(`Delete “${title_of(note.body)}”?`, { detail: "The note's file is deleted.", confirm_label: "Delete", danger: true }))) return;
    draft.cancel();
    await delete_note(files, note);
    selected_id.value = null;
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const text = capture_text.trim();
    if (!text) return;
    capture_text = "";
    await write_todo(files, add_todo(todo_text, text));
  }

  async function new_note() {
    const note = await create_note(files, "", "");
    tab.value = Tab.INBOX;
    query = "";
    await reload();
    selected_id.value = note.id;
    await tick();
    editor?.focus();
  }

  async function update_todo(next: string | null) {
    if (next !== null) await write_todo(files, next);
  }

  function open_source(from: string) {
    const path = from.slice(from.indexOf(" ") + 1);
    if (from.includes(" /")) void apps.open(path);
    else if (apps.get(from)) apps.launch(from);
  }

  $effect(() => win.on_back(() => {
    if (!selected) return false;
    selected_id.value = null;
    return true;
  }));

  $effect(() => win.set_title(selected && tab.value !== Tab.TODO ? title_of(selected.body) : null));

  const tabs = $derived([
    { value: Tab.INBOX, label: inbox.length ? `Inbox ${inbox.length}` : "Inbox", icon: Tray },
    { value: Tab.NOTES, label: "Notes", icon: Notepad },
    { value: Tab.TODO, label: open_todos ? `Todo ${open_todos}` : "Todo", icon: CheckSquare },
  ]);

  const links = $derived(selected ? links_of(draft.body).map((target) => ({ target, note: resolve_link(notes, target) })) : []);
  const backlinks = $derived(selected ? backlinks_of(notes, selected) : []);

  function follow(target: Note) {
    if (target.status === NoteStatus.RAW) tab.value = Tab.INBOX;
    else {
      tab.value = Tab.NOTES;
      filter_status.value = target.status;
    }
    query = "";
    selected_id.value = target.id;
  }

  /** A link to a note that doesn't exist yet creates it, titled by the link, like Obsidian. */
  async function create_linked(title: string) {
    const note = await create_note(files, `# ${title}\n`, "");
    await reload();
    follow(note);
  }

  const status_options = NOTE_STATUSES.map((status) => ({ value: status, label: status[0].toUpperCase() + status.slice(1) }));
</script>

<div class="@container grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <Segmented bind:value={tab.value} options={tabs} label="View" size="sm" />
    {#if tab.value === Tab.TODO}
      <span class="flex-1"></span>
      {#if can_pin}
        {@const list = widget_for(null)}
        <Button
          variant="quiet"
          size="sm"
          pressed={list !== undefined}
          title={list ? "Your todo list is on the desktop. Click to remove it." : "Show your todo list on the desktop, where you can tick things off."}
          onclick={() => toggle_widget(null)}
        >
          <Sticker />{list ? "On desktop" : "Add to desktop"}
        </Button>
      {/if}
    {:else}
      <span class="flex-1"></span>
      <Button variant="primary" size="sm" onclick={new_note} title={capture_keys ? `Anywhere: ${capture_keys}` : undefined}><Plus weight="bold" /> New note</Button>
    {/if}
  </Toolbar>

  <div class="min-h-0">
    {#if tab.value === Tab.TODO}
      <div class="flex h-full flex-col">
        <form class="flex items-center gap-2 border-b border-foreground/8 p-2" onsubmit={add}>
          <Input bind:value={capture_text} size="sm" class="min-w-0 flex-1" placeholder="Add a todo, #tags inline" aria-label="Add a todo" />
          <Button variant="secondary" size="sm" type="submit" disabled={!capture_text.trim()}><Plus weight="bold" />Add</Button>
        </form>
        <div class="min-h-0 flex-1 overflow-auto p-2">
          {#if todos.length === 0}
            <EmptyState icon={CheckSquare} title="Nothing to do" description="Type one in the field above and press Enter." class="h-full" />
          {:else}
            <ul class="grid gap-0.5">
              {#each todos as todo (todo.line)}
                <li class="group flex min-h-8 items-center gap-2.5 rounded-md px-2 hover:bg-foreground/6">
                  <Checkbox checked={todo.done} aria-label={todo.text} onchange={() => update_todo(set_todo(todo_text, todo.n, !todo.done))} />
                  <span class={cn("min-w-0 flex-1 text-ui", todo.done && "text-foreground/45 line-through")}>{todo.text}</span>
                  <IconButton label="Remove" size="sm" class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100" onclick={() => update_todo(remove_todo(todo_text, todo.n))}>
                    <X />
                  </IconButton>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    {:else}
      <div class="grid h-full @2xl:grid-cols-[18rem_1fr]">
        <aside class={cn("flex min-h-0 flex-col border-foreground/8 @2xl:border-r", selected && "hidden @2xl:flex")}>
          <div class="flex items-center gap-2 border-b border-foreground/8 p-2">
            <Input bind:value={query} size="sm" class="min-w-0 flex-1" placeholder="Filter, or #tag" aria-label="Filter notes" />
            {#if tab.value === Tab.NOTES}
              <Select size="sm" bind:value={filter_status.value} aria-label="Status" class="w-auto" options={status_options.filter((option) => option.value !== NoteStatus.RAW)} />
            {/if}
          </div>
          <div class="min-h-0 flex-1 overflow-auto p-1.5">
            {#if loaded && visible.length === 0}
              <EmptyState
                icon={tab.value === Tab.INBOX ? Tray : Notepad}
                title={query ? "No matches" : tab.value === Tab.INBOX ? "Inbox zero" : `No ${filter_status.value} notes`}
                description={tab.value === Tab.INBOX ? `New captures land here.${capture_keys ? ` Press ${capture_keys} anywhere to jot one down.` : ""}` : undefined}
                class="h-full"
              />
            {:else}
              <ul class="grid gap-0.5">
                {#each visible as note (note.id)}
                  <li>
                    <button
                      type="button"
                      class={cn(
                        "grid w-full gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none",
                        note.id === selected_id.value && "bg-primary/14 hover:bg-primary/14"
                      )}
                      onclick={() => (selected_id.value = note.id)}
                      {@attach long_press({ on_menu: (point) => note_menu(note, point) })}
                    >
                      <span class="truncate text-ui font-medium">{title_of(note.body)}</span>
                      <span class="flex items-center gap-2 font-mono text-2xs text-foreground/55 tabular-nums">
                        <span>{note.id}</span>
                        {#if note.created}<span>{format_date(new Date(note.created))}</span>{/if}
                        {#each tags_of(note.body).slice(0, 3) as tag (tag)}<span class="truncate text-primary/80">#{tag}</span>{/each}
                      </span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </aside>

        <section class={cn("min-h-0 flex-col", selected ? "flex" : "hidden @2xl:flex")}>
          {#if selected}
            {@const note = selected}
            <header class="flex flex-wrap items-center gap-2 border-b border-foreground/8 px-2 py-1.5">
              <IconButton label="Back" size="sm" class="@2xl:hidden" onclick={() => (selected_id.value = null)}><ArrowLeft /></IconButton>
              <Segmented bind:value={() => note.status, (status) => set_status(note, status)} options={status_options} label="Status" size="sm" />
              <span class="flex-1"></span>
              {#if can_pin}
                {@const sticky = widget_for(note.id)}
                <Button
                  variant="quiet"
                  size="sm"
                  pressed={sticky !== undefined}
                  title={sticky ? "This note is a sticky on the desktop. Click to remove it." : "Show this note as a sticky on the desktop, where you can edit it."}
                  onclick={() => toggle_widget(note)}
                >
                  <Sticker />{sticky ? "On desktop" : "Add to desktop"}
                </Button>
              {/if}
              <IconButton label="Delete note" size="sm" onclick={() => remove(note)}><Trash /></IconButton>
            </header>
            <Textarea
              bind:element={editor}
              value={draft.body}
              placeholder="Write it down, #tags inline, [[another note]] to link"
              oninput={(event) => draft.edit(event.currentTarget.value)}
              aria-label="Note"
              class="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent px-4 py-3 ring-0 focus-visible:ring-0"
            />
            {#if links.length > 0 || backlinks.length > 0}
              <div class="grid gap-1 border-t border-foreground/8 px-3 py-2 text-ui">
                {#if links.length > 0}
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="w-20 shrink-0 text-2xs tracking-wide text-foreground/55 uppercase">Links to</span>
                    {#each links as link (link.target)}
                      {#if link.note}
                        {@const target = link.note}
                        <Button variant="quiet" size="sm" class="h-6 px-2 text-primary underline decoration-primary/40 underline-offset-2" onclick={() => follow(target)}>{title_of(target.body)}</Button>
                      {:else}
                        <Button variant="quiet" size="sm" class="h-6 px-2 text-foreground/55" title="No note is called this yet. Click to create it." onclick={() => create_linked(link.target)}>
                          <Plus />{link.target}
                        </Button>
                      {/if}
                    {/each}
                  </div>
                {/if}
                {#if backlinks.length > 0}
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="w-20 shrink-0 text-2xs tracking-wide text-foreground/55 uppercase">Linked from</span>
                    {#each backlinks as source (source.id)}
                      <Button variant="quiet" size="sm" class="h-6 px-2 text-primary underline decoration-primary/40 underline-offset-2" onclick={() => follow(source)}>{title_of(source.body)}</Button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
            <div class="flex flex-wrap items-center gap-2 border-t border-foreground/8 px-3 py-1.5 font-mono text-2xs text-foreground/55">
              {#if note.created}<span>{format_datetime(new Date(note.created))}</span>{/if}
              {#if note.from}
                <Button variant="quiet" size="sm" class="h-5 px-1 font-mono text-2xs" onclick={() => open_source(note.from)}>from {note.from}</Button>
              {/if}
              {#each tags_of(draft.body) as tag (tag)}<Badge tone="primary">#{tag}</Badge>{/each}
            </div>
          {:else}
            <EmptyState icon={Notepad} title="No note open" description="Pick one from the list." class="h-full" />
          {/if}
        </section>
      </div>
    {/if}
  </div>

  <StatusBar>
    <span>{inbox.length} in inbox</span>
    <span>{notes.filter((note) => note.status === NoteStatus.READY).length} ready</span>
    <span>{open_todos} open {open_todos === 1 ? "todo" : "todos"}</span>
    <span class="hidden @md:inline">{NOTES_DIR}</span>
  </StatusBar>
</div>

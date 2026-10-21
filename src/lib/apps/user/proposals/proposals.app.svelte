<script lang="ts">
  import kernel, {
    Platform,
    ShortcutCategory,
    type DialogsService,
    type NotificationsService,
    type ShortcutsService,
  } from "$lib/core/api";
  import { Button, EmptyState, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { base_name, file_stem, parent_path } from "$lib/core/api/services/files/path";
  import {
    CaretDown as CaretDownIcon,
    FilePlus as FilePlusIcon,
    Files as FilesIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    Lightbulb as LightbulbIcon,
    PaperPlaneTilt as PaperPlaneTiltIcon,
    Plus as PlusIcon,
    Note as NoteIcon,
  } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import { EXTENSION, serialize_notebook } from "./format";
  import { file_name_for, read_notebook, send_file, SendResult, with_extension, write_file } from "./io";
  import {
    add_proposal,
    create_proposal,
    filter_proposals,
    only,
    remove_proposal,
    title_of,
    update_proposal,
    type Proposal,
    type StatusFilter,
  } from "./model";
  import { NotebookDocument, starter_notebook } from "./notebook.svelte";
  import ProposalEditor from "./proposal-editor.svelte";
  import ProposalsList from "./proposals-list.svelte";
  import SketchPad from "./sketch-pad.svelte";
  import { report_error } from "$kit/utils/report-error";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window_id, window: win } = get_app_context();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const mobile = kernel.platform === Platform.MOBILE;

  const doc = new NotebookDocument();

  let file_path = $state<string | null>(null);
  let loading = $state(false);
  let filter = $state<StatusFilter>("all");
  let selected_id = $state<string | null>(untrack(() => doc.notebook.proposals[0]?.id ?? null));
  let pane = $state<"list" | "editor">("editor");
  let created_id = $state<string | null>(null);
  let sketch = $state.raw<{ insert: (image: string) => void } | null>(null);

  const notebook = $derived(doc.notebook);
  const proposals = $derived(notebook.proposals);
  const selected = $derived(proposals.find((proposal) => proposal.id === selected_id) ?? null);
  const file_name = $derived(file_path ? base_name(file_path) : with_extension(notebook.title));
  const read_only = $derived(file_path !== null && is_system_path(file_path));
  const visible = $derived(filter_proposals(proposals, filter));

  $effect(() => win.set_title(file_name));
  $effect(() => win.set_dirty(doc.dirty, { save }));
  $effect(() =>
    win.on_back(() => {
      if (sketch) return (sketch = null), true;
      if (pane === "editor") return (pane = "list"), true;
      return false;
    })
  );

  function report(title: string, reason: unknown) {
    report_error(app_id, title, reason);
  }

  async function discard_ok(): Promise<boolean> {
    return !doc.dirty || confirm_discard(win, file_name);
  }

  function show(id: string | null) {
    selected_id = id;
    sketch = null;
    pane = id ? "editor" : "list";
  }

  let open_request = 0;

  async function load(path: string) {
    const id = ++open_request;
    loading = true;
    try {
      const opened = await read_notebook(path);
      if (id !== open_request) return;
      doc.load(opened, true);
      file_path = path;
      filter = "all";
      show(opened.proposals[0]?.id ?? null);
      if (opened.proposals.length > 1) pane = "list";
    } catch (reason) {
      if (id === open_request) report(`Couldn't open ${base_name(path)}`, reason);
    } finally {
      if (id === open_request) loading = false;
    }
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({
      accept: [EXTENSION],
      start_path: file_path ? parent_path(file_path) : undefined,
      title: "Open in Proposals",
    });
    if (chosen) await load(chosen);
  }

  async function create_notebook_file() {
    if (!(await discard_ok())) return;
    const fresh = starter_notebook();
    doc.load(fresh, true);
    file_path = null;
    filter = "all";
    show(fresh.proposals[0].id);
  }

  async function write(path: string): Promise<boolean> {
    const snapshot = doc.notebook;
    try {
      await write_file(path, serialize_notebook(snapshot));
      file_path = path;
      doc.mark_saved(snapshot);
      notifications.notify(app_id, { title: "Proposals saved", message: path });
      return true;
    } catch (reason) {
      report("Couldn't save the proposals", reason);
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const path = await win.pick_save({
      name: file_name,
      accept: [EXTENSION],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
      title: "Save proposals",
    });
    return path ? write(with_extension(path)) : false;
  }

  function save(): Promise<boolean> {
    return file_path && !read_only ? write(file_path) : save_as();
  }

  function add() {
    const proposal = create_proposal();
    doc.apply((value) => add_proposal(value, proposal));
    if (filter !== "all" && filter !== proposal.status) filter = "all";
    created_id = proposal.id;
    show(proposal.id);
  }

  function change(id: string, update: (proposal: Proposal) => Proposal) {
    doc.apply((value) => update_proposal(value, id, update));
  }

  async function remove(proposal: Proposal) {
    const ok = await win.confirm(`Delete “${title_of(proposal)}”?`, {
      detail: "Its text and pictures are removed from this notebook.",
      confirm_label: "Delete",
      danger: true,
    });
    if (!ok) return;
    const index = proposals.indexOf(proposal);
    doc.apply((value) => remove_proposal(value, proposal.id));
    const next = doc.notebook.proposals[Math.min(index, doc.notebook.proposals.length - 1)] ?? null;
    show(next?.id ?? null);
    if (next && !mobile) pane = "editor";
  }

  async function send(scope: "notebook" | "proposal") {
    const one = scope === "proposal" && selected;
    const content = serialize_notebook(one ? only(notebook, selected.id) : notebook);
    const name = one ? file_name_for(title_of(selected)) : file_name;
    try {
      const result = await send_file(content, name);
      if (result === SendResult.SAVED) notifications.notify(app_id, { title: "Saved to your device", message: name });
    } catch (reason) {
      report("Couldn't send the proposals", reason);
    }
  }

  function anchor_of(event: MouseEvent) {
    const target = event.currentTarget;
    if (!(target instanceof Element)) return { x: event.clientX, y: event.clientY };
    const box = target.getBoundingClientRect();
    return { x: box.left, y: box.bottom + 4 };
  }

  async function file_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      [
        { id: "new", label: "New notebook", icon: FilePlusIcon },
        { id: "open", label: "Open…", icon: FolderOpenIcon, shortcut: "Mod+O" },
        { id: "save", label: "Save", icon: FloppyDiskIcon, shortcut: "Mod+S" },
        { id: "save-as", label: "Save as…", icon: FloppyDiskBackIcon, shortcut: "Mod+Shift+S" },
      ],
      { anchor: anchor_of(event) }
    );
    if (choice === "new") void create_notebook_file();
    else if (choice === "open") void open();
    else if (choice === "save") void save();
    else if (choice === "save-as") void save_as();
  }

  async function send_menu(event: MouseEvent) {
    const count = proposals.length;
    const choice = await dialogs.menu(
      [
        { id: "notebook", label: `Whole notebook (${count} ${count === 1 ? "proposal" : "proposals"})`, icon: FilesIcon },
        ...(selected ? [{ id: "proposal", label: `Only “${title_of(selected)}”`, icon: NoteIcon }] : []),
      ],
      { anchor: anchor_of(event) }
    );
    if (choice === "notebook" || choice === "proposal") void send(choice);
  }

  onMount(() => {
    const path = untrack(() => initial_path);
    if (path) void load(path);
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `proposals.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("open", "mod+o", "Open…", open),
      scoped("save", "mod+s", "Save", save),
      scoped("save-as", "mod+shift+s", "Save as…", save_as),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });
</script>

<div class="proposals relative grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] bg-background" data-pane={pane}>
  <Toolbar class="flex-nowrap gap-1">
    <Button size="sm" variant="quiet" class="max-w-48 min-w-0 shrink gap-1 pr-1.5" title={file_path ?? "Not saved yet"} onclick={file_menu}>
      <span class="min-w-0 truncate">{mobile ? file_stem(file_stem(file_name)) : "File"}</span>
      {#if mobile && doc.dirty}<span class="size-2 shrink-0 rounded-full bg-primary"></span>{/if}
      <CaretDownIcon weight="bold" class="size-3 shrink-0 opacity-65" />
    </Button>
    <div class="flex-1"></div>
    <Button size="sm" variant="primary" class="shrink-0" disabled={!proposals.length} onclick={send_menu}>
      <PaperPlaneTiltIcon weight="bold" />Send
    </Button>
  </Toolbar>

  <div class="body grid min-h-0">
    <nav class="list-pane min-h-0 overflow-y-auto border-foreground/8 bg-background-light" aria-label="Proposals">
      <ProposalsList {proposals} selected={selected_id} bind:filter onselect={show} oncreate={add} />
    </nav>

    <main class="editor-pane min-h-0 overflow-y-auto">
      {#if selected}
        {#key selected.id}
          <ProposalEditor
            proposal={selected}
            onchange={(update) => change(selected.id, update)}
            ondelete={() => remove(selected)}
            onback={() => (pane = "list")}
            onsketch={(insert) => (sketch = { insert })}
            onerror={report}
            fresh={created_id === selected.id}
          />
        {/key}
      {:else}
        <EmptyState
          icon={LightbulbIcon}
          title={proposals.length ? "Pick a proposal" : "No proposals yet"}
          description="Each proposal walks through the problem, what it does, a picture and the rest of the pitch."
        >
          {#snippet actions()}
            <Button size="sm" variant="primary" onclick={add}><PlusIcon weight="bold" />New proposal</Button>
          {/snippet}
        </EmptyState>
      {/if}
    </main>

    {#if loading}
      <div class="absolute inset-0 grid place-items-center bg-background-darker/70"><Spinner label="Opening proposals" /></div>
    {/if}
  </div>

  <StatusBar>
    <span>{proposals.length} {proposals.length === 1 ? "proposal" : "proposals"}</span>
    {#if filter !== "all"}<span class="hidden @sm:inline">{visible.length} shown</span>{/if}
    <span class="hidden @md:inline">{file_path ?? "Not saved yet"}</span>
  </StatusBar>

  {#if sketch}
    <SketchPad
      oninsert={(image) => {
        sketch?.insert(image);
        sketch = null;
      }}
      oncancel={() => (sketch = null)}
    />
  {/if}
</div>

<style>
  .proposals {
    container: proposals / inline-size;
  }

  .body {
    grid-template-columns: minmax(0, 1fr);
  }

  .proposals[data-pane="editor"] .list-pane,
  .proposals[data-pane="list"] .editor-pane {
    display: none;
  }

  @container proposals (width >= 44rem) {
    .body {
      grid-template-columns: 17rem minmax(0, 1fr);
    }

    .proposals[data-pane] .list-pane,
    .proposals[data-pane] .editor-pane {
      display: block;
    }

    .list-pane {
      border-right-width: 1px;
    }

    .editor-pane :global(.back) {
      display: none;
    }
  }
</style>

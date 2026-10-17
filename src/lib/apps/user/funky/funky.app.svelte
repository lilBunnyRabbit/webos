<script lang="ts">
  import kernel, { NotificationType, ShortcutCategory, type DialogsService, type FilesService, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import { base_name, file_stem, parent_path } from "$lib/core/api/services/files/path";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { diagnostics_gutter, reveal, show_diagnostics, symbol_assist, token_highlight, token_theme } from "$lib/core/components/code";
  import { Button, EmptyState, IconButton, Segmented, Select, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { cn, error_message } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { indentWithTab } from "@codemirror/commands";
  import { Compartment, EditorState, Text } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { basicSetup } from "codemirror";
  import {
    Books as BooksIcon,
    Devices as DevicesIcon,
    FileArrowUp as FileArrowUpIcon,
    FilePlus as FilePlusIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    WarningCircle as WarningCircleIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import type { Span } from "./ast";
  import { compile, type CompileResult } from "./compile";
  import { decompile, read_craft, type Craft } from "./craft";
  import { Severity } from "./diagnostics";
  import { EXAMPLES, NEW_FILE, type Example } from "./examples";
  import FunkyEmitted from "./funky-emitted.svelte";
  import FunkyImport from "./funky-import.svelte";
  import FunkyProblems from "./funky-problems.svelte";
  import FunkySimulator from "./funky-simulator.svelte";
  import { all_docs, funky_language } from "./language";
  import type { SimSetup } from "./presets";

  const { path: initial_path }: { path?: string } = $props();

  const { app_id, window_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const View = { CODE: "code", SIMULATE: "simulate", SETTERS: "setters", PARTS: "parts", PROBLEMS: "problems", IMPORT: "import" } as const;
  type View = (typeof View)[keyof typeof View];
  const VIEW_IDS = Object.values(View) as [View, ...View[]];
  const view = storage.window<View>("view", View.CODE, z.enum(VIEW_IDS));
  const panel = $derived(view.value === View.CODE ? View.SIMULATE : view.value);

  const Status = { LOADING: "loading", READY: "ready", ERROR: "error" } as const;
  type Status = (typeof Status)[keyof typeof Status];

  const EXTENSION = ".fdsl";
  const is_craft_path = (target: string) => target.toLowerCase().endsWith(".xml");
  const DEFAULT_SETUP: SimSetup = { preset: "cruise", script: "", plot: [] };

  let path = $state<string | null>(untrack(() => (initial_path && !is_craft_path(initial_path) ? initial_path : null)));
  let untitled_name = $state(`Untitled${EXTENSION}`);
  let status = $state<Status>(untrack(() => (path ? Status.LOADING : Status.READY)));
  let error = $state("");
  let doc = $state.raw<Text>(Text.empty);
  let saved_doc = $state.raw<Text>(Text.empty);
  let example = $state<Example | null>(null);
  let setup = $state.raw<SimSetup>(DEFAULT_SETUP);
  let load_id = 0;

  let craft = $state.raw<Craft | null>(null);
  let craft_name = $state<string | null>(null);
  let craft_notes = $state.raw<string[]>([]);

  let view_ref = $state.raw<EditorView | null>(null);
  const read_only_slot = new Compartment();

  const text = $derived(doc.toString());
  const dirty = $derived(!doc.eq(saved_doc));
  const read_only = $derived(path !== null && is_system_path(path));
  const name = $derived(path ? base_name(path) : untitled_name);

  const result = $derived(compile(text));
  let last_ok: CompileResult | null = null;
  const built = $derived.by(() => {
    if (result.ok) last_ok = result;
    return last_ok ?? result;
  });
  const docs = $derived(all_docs(result.scope));
  const errors = $derived(result.diagnostics.filter((diagnostic) => diagnostic.severity === Severity.ERROR).length);
  const warnings = $derived(result.diagnostics.filter((diagnostic) => diagnostic.severity === Severity.WARNING).length);

  const VIEW_OPTIONS = $derived([
    { value: View.SIMULATE, label: "Simulate" },
    { value: View.SETTERS, label: `Setters ${built.setters.length}` },
    { value: View.PARTS, label: `Parts ${built.outputs.length}` },
    { value: View.PROBLEMS, label: errors + warnings ? `Problems ${errors + warnings}` : "Problems" },
    { value: View.IMPORT, label: "Import" },
  ]);

  function mount(host: HTMLElement) {
    const editor = new EditorView({
      parent: host,
      state: EditorState.create({
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          token_theme,
          token_highlight,
          funky_language,
          symbol_assist(() => docs),
          diagnostics_gutter,
          EditorView.lineWrapping,
          read_only_slot.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) doc = update.state.doc;
          }),
        ],
      }),
    });
    view_ref = editor;
    untrack(() => {
      if (path) void load(path);
      else open_untitled(untitled_name, NEW_FILE, DEFAULT_SETUP);
      if (initial_path && is_craft_path(initial_path)) void open_craft(initial_path);
    });
    return () => {
      editor.destroy();
      view_ref = null;
    };
  }

  function set_doc(content: string) {
    if (!view_ref) return;
    last_ok = null;
    view_ref.dispatch({ changes: { from: 0, to: view_ref.state.doc.length, insert: content }, selection: { anchor: 0 } });
    view_ref.scrollDOM.scrollTop = 0;
  }

  async function load(target: string) {
    const id = ++load_id;
    status = Status.LOADING;
    try {
      const file = await files.get_file(target);
      if (id !== load_id) return;
      if (!file) throw new Error(`File not found: ${target}`);
      const content = await file.text();
      if (id !== load_id) return;
      path = target;
      example = null;
      set_doc(content);
      saved_doc = doc;
      setup = { ...DEFAULT_SETUP };
      status = Status.READY;
    } catch (reason) {
      if (id !== load_id) return;
      path = target;
      error = error_message(reason);
      status = Status.ERROR;
    }
  }

  function open_untitled(file_name: string, content: string, next_setup: SimSetup) {
    load_id++;
    path = null;
    untitled_name = file_name;
    set_doc(content);
    saved_doc = doc;
    setup = next_setup;
    status = Status.READY;
  }

  const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? "" : "s"}`;

  const discard_ok = async () => !dirty || confirm_discard(win, name);

  async function new_file() {
    if (!(await discard_ok())) return;
    example = null;
    open_untitled(`Untitled${EXTENSION}`, NEW_FILE, DEFAULT_SETUP);
    view_ref?.focus();
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({ accept: [EXTENSION, ".xml"], start_path: path ? parent_path(path) : undefined, title: "Open in Funky DSL" });
    if (!chosen) return;
    if (is_craft_path(chosen)) await open_craft(chosen);
    else await load(chosen);
  }

  async function open_device() {
    if (!(await discard_ok())) return;
    const [file] = await pick_device_files({ accept: [EXTENSION, ".xml"] });
    if (!file) return;
    try {
      if (is_craft_path(file.name)) show_craft(file.name, await file.text());
      else {
        example = null;
        open_untitled(file.name, await file.text(), DEFAULT_SETUP);
      }
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't read the file", message: error_message(reason) });
    }
  }

  async function write(target: string): Promise<boolean> {
    try {
      const directory = await files.get_directory(parent_path(target));
      if (!directory) throw new Error(`Folder not found: ${parent_path(target)}`);
      const written = doc;
      await files.create_file(directory, base_name(target), { content: written.toString(), overwrite: true });
      saved_doc = written;
      path = target;
      return true;
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't save the file", message: error_message(reason) });
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const suggested = path ? name : untitled_name.endsWith(EXTENSION) ? untitled_name : `${file_stem(untitled_name)}${EXTENSION}`;
    const target = await win.pick_save({ name: suggested, accept: [EXTENSION], start_path: path && !read_only ? parent_path(path) : "/home/Documents" });
    return target ? write(target) : false;
  }

  function save(): Promise<boolean> {
    return path && !read_only ? write(path) : save_as();
  }

  async function choose_example(event: MouseEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const choice = await dialogs.menu(
      EXAMPLES.map((entry) => ({ id: entry.id, label: entry.name })),
      { anchor: { x: box.left, y: box.bottom } }
    );
    const chosen = EXAMPLES.find((entry) => entry.id === choice);
    if (!chosen || !(await discard_ok())) return;
    example = chosen;
    open_untitled(`${chosen.id}${EXTENSION}`, chosen.source, { preset: chosen.preset, script: chosen.script, plot: chosen.plot });
    if (view.value !== View.CODE) view.value = View.SIMULATE;
  }

  function show_craft(file_name: string, xml: string) {
    try {
      const read = read_craft(xml);
      craft = read;
      craft_name = file_name;
      craft_notes = decompile(read).notes;
      view.value = View.IMPORT;
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't read the craft", message: error_message(reason) });
    }
  }

  async function open_craft(target: string) {
    try {
      const file = await files.get_file(target);
      if (!file) throw new Error(`File not found: ${target}`);
      show_craft(base_name(target), await file.text());
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't read the craft", message: error_message(reason) });
    }
  }

  async function pick_craft() {
    const chosen = await win.pick_file({ accept: [".xml"], start_path: path ? parent_path(path) : undefined, title: "Import a SimplePlanes craft" });
    if (chosen) await open_craft(chosen);
  }

  async function pick_craft_device() {
    const [file] = await pick_device_files({ accept: [".xml"] });
    if (!file) return;
    try {
      show_craft(file.name, await file.text());
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't read the craft", message: error_message(reason) });
    }
  }

  async function open_craft_as_code() {
    if (!craft || !(await discard_ok())) return;
    example = null;
    const stem = file_stem(craft_name ?? "") || craft.name || "craft";
    open_untitled(`${stem}${EXTENSION}`, decompile(craft).source, DEFAULT_SETUP);
    saved_doc = Text.empty;
    view.value = compile(text).ok ? View.SETTERS : View.PROBLEMS;
  }

  function show_span(span: Span) {
    if (!view_ref) return;
    if (!view_ref.dom.checkVisibility()) view.value = View.CODE;
    requestAnimationFrame(() => view_ref && reveal(view_ref, span.from, span.to));
  }

  $effect(() => {
    const current = view_ref;
    if (!current) return;
    show_diagnostics(
      current,
      result.diagnostics.flatMap((diagnostic) => (diagnostic.span ? [{ from: diagnostic.span.from, to: diagnostic.span.to, severity: diagnostic.severity, message: diagnostic.message }] : []))
    );
  });

  $effect(() => {
    const locked = read_only;
    view_ref?.dispatch({ effects: read_only_slot.reconfigure(locked ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []) });
  });

  $effect(() => win.set_title(name));
  $effect(() => win.set_dirty(dirty, { save }));

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `funky.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [scoped("open", "mod+o", "Open…", open), scoped("save", "mod+s", "Save", save), scoped("save-as", "mod+shift+s", "Save as…", save_as)];
    return () => disposers.forEach((dispose) => dispose());
  });
</script>

<div class="flex h-full flex-col">
  <Toolbar>
    <IconButton label="New" size="sm" onclick={new_file}><FilePlusIcon weight="bold" /></IconButton>
    <IconButton label="Open…" size="sm" onclick={open}><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Open from device…" size="sm" onclick={open_device}><DevicesIcon weight="bold" /></IconButton>
    <IconButton label="Save" size="sm" disabled={read_only} onclick={save}><FloppyDiskIcon weight="bold" /></IconButton>
    <IconButton label="Save as…" size="sm" onclick={save_as}><FloppyDiskBackIcon weight="bold" /></IconButton>
    <Separator vertical />
    <Button size="sm" variant="quiet" onclick={choose_example}><BooksIcon weight="bold" /> Examples</Button>
    <IconButton label="Import a craft…" size="sm" onclick={() => (view.value = View.IMPORT)}><FileArrowUpIcon weight="bold" /></IconButton>
    <span class="hidden min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80 @lg:block" title={path ?? "Not saved yet"}>{path ?? "Not saved yet"}</span>
    <Select
      size="sm"
      aria-label="View"
      class="ml-auto w-auto @4xl:hidden"
      bind:value={view.value}
      options={[{ value: View.CODE, label: "Code" }, ...VIEW_OPTIONS]}
    />
  </Toolbar>

  {#if example}
    <div class="flex items-start gap-2 border-b border-foreground/8 bg-background-light px-3 py-1.5 text-ui">
      <span class="min-w-0 flex-1"><span class="font-medium">{example.name}.</span> <span class="text-foreground/80">{example.description}</span></span>
      <IconButton label="Hide the description" size="sm" onclick={() => (example = null)}><XIcon weight="bold" /></IconButton>
    </div>
  {/if}

  <div class="grid min-h-0 flex-1 @4xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
    <div class={cn("relative min-h-0 min-w-0", view.value !== View.CODE && "hidden @4xl:block")}>
      <div class="h-full" {@attach mount}></div>
      {#if status !== Status.READY}
        <div class="absolute inset-0 grid bg-background">
          {#if status === Status.LOADING}
            <div class="grid place-items-center"><Spinner label="Reading file" /></div>
          {:else}
            <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't read the file" description={error}>
              {#snippet actions()}<Button variant="primary" onclick={open}><FolderOpenIcon weight="bold" /> Open a file…</Button><Button onclick={new_file}>New file</Button>{/snippet}
            </EmptyState>
          {/if}
        </div>
      {/if}
    </div>

    <div class={cn("flex min-h-0 min-w-0 flex-col @4xl:border-l @4xl:border-foreground/8", view.value === View.CODE && "hidden @4xl:flex")}>
      <div class="hidden overflow-x-auto border-b border-foreground/8 p-2 @4xl:block">
        <Segmented size="sm" label="Panel" bind:value={() => panel, (next) => (view.value = next)} options={VIEW_OPTIONS} />
      </div>
      {#if !result.ok && panel !== View.PROBLEMS && panel !== View.IMPORT}
        <button
          type="button"
          class="flex items-center gap-2 border-b border-foreground/8 bg-error/10 px-3 py-1.5 text-left text-ui hover:bg-error/15"
          onclick={() => (view.value = View.PROBLEMS)}
        >
          <WarningCircleIcon class="size-4 shrink-0 text-error" weight="fill" />
          <span class="min-w-0 flex-1">{count(errors, "error")}. {built !== result ? "Showing the last build that compiled." : "Nothing compiles yet."}</span>
        </button>
      {/if}
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div hidden={panel !== View.SIMULATE}>
          <FunkySimulator result={built} {setup} {path} active={panel === View.SIMULATE} />
        </div>
        {#if panel === View.SETTERS}
          <FunkyEmitted kind="setters" entries={built.setters} xml={built.xml} onreveal={show_span} />
        {:else if panel === View.PARTS}
          <FunkyEmitted kind="parts" entries={built.outputs} xml={built.xml} onreveal={show_span} />
        {:else if panel === View.PROBLEMS}
          <FunkyProblems diagnostics={result.diagnostics} source={text} onreveal={show_span} />
        {:else if panel === View.IMPORT}
          <FunkyImport {craft} source_name={craft_name} notes={craft_notes} onpick={pick_craft} onpickdevice={pick_craft_device} onopen={open_craft_as_code} />
        {/if}
      </div>
    </div>
  </div>

  <StatusBar>
    <span class="truncate">{name}</span>
    {#if read_only}<span class="shrink-0">Read-only</span>{/if}
    <span class="ml-auto shrink-0">{count(built.setters.length, "setter")}</span>
    <span class="shrink-0">{count(built.outputs.length, "part")}</span>
    <span class={cn("shrink-0", errors ? "text-error" : warnings ? "text-warning" : "")}>
      {errors ? count(errors, "error") : warnings ? count(warnings, "warning") : "Compiled"}
    </span>
  </StatusBar>
</div>

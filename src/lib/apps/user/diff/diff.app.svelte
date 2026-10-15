<script lang="ts">
  import kernel, { NotificationType, ShortcutCategory, type FilesService, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { Button, EmptyState, IconButton, Segmented, Select, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn, error_message } from "$lib/core/utils";
  import { load_language, token_highlight, token_theme, type Language } from "$lib/core/components/code";
  import { indentWithTab } from "@codemirror/commands";
  import type { LanguageSupport } from "@codemirror/language";
  import {
    getChunks,
    getOriginalDoc,
    goToNextChunk,
    goToPreviousChunk,
    MergeView,
    uncollapseUnchanged,
    unifiedMergeView,
    type DiffConfig,
  } from "@codemirror/merge";
  import { Compartment, EditorState, type Extension, type StateCommand } from "@codemirror/state";
  import { EditorView, keymap, placeholder } from "@codemirror/view";
  import { basicSetup } from "codemirror";
  import {
    ArrowsInLineVertical as ArrowsInLineVerticalIcon,
    ArrowsLeftRight as ArrowsLeftRightIcon,
    CaretDown as CaretDownIcon,
    CaretUp as CaretUpIcon,
    ClipboardText as ClipboardTextIcon,
    Columns as ColumnsIcon,
    Devices as DevicesIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    GitDiff as GitDiffIcon,
    LockSimple as LockSimpleIcon,
    Paragraph as ParagraphIcon,
    Rows as RowsIcon,
    TextAlignLeft as TextAlignLeftIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { default_mode, DiffMode, ignore_whitespace_diff, map_line, SCAN_LIMIT, summarize, type DiffSummary } from "./diff";
  import { DIFF_ACCEPT } from "./index";
  import { DiffSide } from "./side.svelte";
  import { merge_theme } from "./theme";
  import { parent_path } from "$lib/core/api/services/files/path";

  const { left: left_prop, right: right_prop, path: path_prop }: { left?: string; right?: string; path?: string } = $props();

  const { app_id, window_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  const chosen_mode = storage.window<DiffMode | null>("mode", null, z.enum([DiffMode.SPLIT, DiffMode.UNIFIED]).nullable());
  const collapse = storage.persisted("collapse", true, z.boolean());
  const ignore_space = storage.persisted("ignore-whitespace", false, z.boolean());
  const wrap = storage.persisted("wrap", false, z.boolean());

  const left = new DiffSide(() => files);
  const right = new DiffSide(() => files);

  let width = $state(0);
  const measured = $derived(width > 0);
  const mode = $derived(chosen_mode.value ?? default_mode(width));
  let loading = $state(untrack(() => Boolean(left_prop ?? path_prop ?? right_prop)));
  let started = $state(false);
  /** Bumped when a side's text is replaced from outside the editors, which rebuilds them. */
  let revision = $state(0);
  const show_empty = $derived(!loading && !started && left.empty && right.empty);
  const dirty = $derived(left.dirty || right.dirty);

  let host = $state<HTMLElement | null>(null);
  let merge = $state.raw<MergeView | null>(null);
  let unified = $state.raw<EditorView | null>(null);
  let last_focused: EditorView | null = null;
  let summary = $state<DiffSummary>({ changes: 0, added: 0, removed: 0 });
  let summary_queued = false;

  const slot_a = new Compartment();
  const slot_b = new Compartment();
  const languages = new Map<Language, LanguageSupport>();

  const editor_a = $derived(merge?.a ?? null);
  const editor_b = $derived(merge?.b ?? unified);

  function queue_summary() {
    if (summary_queued) return;
    summary_queued = true;
    queueMicrotask(() => {
      summary_queued = false;
      const b = editor_b;
      if (!b) return;
      const chunks = getChunks(b.state)?.chunks ?? [];
      summary = summarize(chunks, merge ? merge.a.state.doc : getOriginalDoc(b.state), b.state.doc);
    });
  }

  function side_extensions(side: DiffSide, slot: Compartment, hint: string, wrapped: boolean): Extension[] {
    return [
      basicSetup,
      keymap.of([indentWithTab]),
      token_theme,
      token_highlight,
      merge_theme,
      wrapped ? EditorView.lineWrapping : [],
      slot.of((side.language && languages.get(side.language)) ?? []),
      placeholder(hint),
      side.read_only ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [],
      EditorView.updateListener.of((update) => {
        if (update.docChanged) side.text = update.state.doc.toString();
        if (update.focusChanged && update.view.hasFocus) last_focused = update.view;
        if (update.docChanged || getChunks(update.startState)?.chunks !== getChunks(update.state)?.chunks) queue_summary();
      }),
    ];
  }

  interface BuildOptions {
    mode: DiffMode;
    collapse: boolean;
    ignore_space: boolean;
    wrap: boolean;
  }

  function build(target: HTMLElement, options: BuildOptions) {
    const diffConfig: DiffConfig = options.ignore_space ? { scanLimit: SCAN_LIMIT, override: ignore_whitespace_diff } : { scanLimit: SCAN_LIMIT };
    const collapseUnchanged = options.collapse ? { margin: 3, minSize: 4 } : undefined;
    if (options.mode === DiffMode.SPLIT) {
      const view = new MergeView({
        parent: target,
        a: { doc: left.text, extensions: side_extensions(left, slot_a, "Paste or type the original text", options.wrap) },
        b: { doc: right.text, extensions: side_extensions(right, slot_b, "Paste or type the changed text", options.wrap) },
        collapseUnchanged,
        diffConfig,
      });
      merge = view;
      queue_summary();
      return () => {
        view.destroy();
        merge = null;
      };
    }
    const view = new EditorView({
      parent: target,
      state: EditorState.create({
        doc: right.text,
        extensions: [
          side_extensions(right, slot_b, "Paste or type the changed text", options.wrap),
          unifiedMergeView({ original: left.text, mergeControls: false, collapseUnchanged, diffConfig }),
        ],
      }),
    });
    unified = view;
    queue_summary();
    return () => {
      view.destroy();
      unified = null;
    };
  }

  $effect(() => {
    if (!host || !measured) return;
    const options = { mode, collapse: collapse.value, ignore_space: ignore_space.value, wrap: wrap.value };
    void revision;
    const target = host;
    last_focused = null;
    return untrack(() => build(target, options));
  });

  async function set_language(view: EditorView, slot: Compartment, language: Language | null) {
    let support: LanguageSupport | null = null;
    if (language) {
      support = languages.get(language) ?? (await load_language(language));
      languages.set(language, support);
    }
    if (view.dom.isConnected) view.dispatch({ effects: slot.reconfigure(support ?? []) });
  }

  $effect(() => {
    if (editor_a) void set_language(editor_a, slot_a, left.language);
  });
  $effect(() => {
    if (editor_b) void set_language(editor_b, slot_b, right.language);
  });

  // The library maps a collapsed block to the other editor by character offset, which drifts when ignored whitespace
  // makes unchanged text differ in length. Lines don't drift.
  function expand_collapsed(event: MouseEvent) {
    if (!merge || !(event.target instanceof Element)) return;
    const widget = event.target.closest(".cm-collapsedLines");
    if (!widget) return;
    event.stopPropagation();
    const side = merge.a.dom.contains(widget) ? "a" : "b";
    const [ours, theirs] = side === "a" ? [merge.a, merge.b] : [merge.b, merge.a];
    const pos = ours.posAtDOM(widget);
    const line = map_line(getChunks(ours.state)?.chunks ?? [], ours.state.doc.lineAt(pos).number, side, merge.a.state.doc, merge.b.state.doc);
    ours.dispatch({ effects: uncollapseUnchanged.of(pos) });
    if (line <= theirs.state.doc.lines) theirs.dispatch({ effects: uncollapseUnchanged.of(theirs.state.doc.line(line).from) });
  }

  function go(command: StateCommand) {
    const live = last_focused && (last_focused === editor_a || last_focused === editor_b) ? last_focused : editor_b;
    if (!live) return;
    command({ state: live.state, dispatch: (transaction) => live.dispatch(transaction) });
    live.focus();
  }

  function report(title: string, reason: unknown) {
    notifications.notify(app_id, { type: NotificationType.ERROR, title, message: error_message(reason) });
  }

  async function replace_ok(side: DiffSide): Promise<boolean> {
    if (!side.dirty) return true;
    return win.confirm(`Discard changes to “${side.name}”?`, {
      detail: "Your unsaved changes will be lost.",
      confirm_label: "Discard",
      danger: true,
    });
  }

  async function load_into(side: DiffSide, path: string) {
    try {
      if (await side.load(path)) revision++;
      else notifications.notify(app_id, { type: NotificationType.ERROR, title: "File not found", message: path });
    } catch (reason) {
      report("Couldn't read the file", reason);
    }
  }

  async function open_file(side: DiffSide, role: string) {
    if (!(await replace_ok(side))) return;
    const chosen = await win.pick_file({
      accept: DIFF_ACCEPT,
      start_path: side.path ? parent_path(side.path) : undefined,
      title: `Open the ${role.toLowerCase()} file`,
    });
    if (chosen) await load_into(side, chosen);
  }

  async function read_device_file(side: DiffSide, file: File) {
    try {
      side.set_text(await file.text(), file.name);
      revision++;
    } catch (reason) {
      report("Couldn't read the file", reason);
    }
  }

  async function open_device(side: DiffSide) {
    if (!(await replace_ok(side))) return;
    const [file] = await pick_device_files({ accept: DIFF_ACCEPT });
    if (file) await read_device_file(side, file);
  }

  async function paste(side: DiffSide) {
    if (!(await replace_ok(side))) return;
    try {
      side.set_text(await navigator.clipboard.readText(), "Pasted text");
      started = true;
      revision++;
    } catch (reason) {
      report("Couldn't read the clipboard", reason);
    }
  }

  async function open_both() {
    await open_file(left, "original");
    if (!left.empty) await open_file(right, "changed");
  }

  async function open_both_device() {
    const [first, second] = await pick_device_files({ accept: DIFF_ACCEPT, multiple: true });
    if (first) await read_device_file(left, first);
    if (second) await read_device_file(right, second);
  }

  function start_typing() {
    started = true;
    (editor_a ?? editor_b)?.focus();
  }

  function set_mode(value: DiffMode) {
    chosen_mode.value = value;
  }

  function swap() {
    left.swap_with(right);
    revision++;
  }

  async function save_side(side: DiffSide): Promise<boolean> {
    try {
      return await side.save(() =>
        win.confirm(`“${side.name}” changed on disk`, {
          detail: "Saving replaces the newer version with yours.",
          confirm_label: "Overwrite",
          danger: true,
        })
      );
    } catch (reason) {
      report("Couldn't save the file", reason);
      return false;
    }
  }

  async function save_all(): Promise<boolean> {
    for (const side of [left, right]) {
      if (side.dirty && !(await save_side(side))) return false;
    }
    return true;
  }

  function watch(side: DiffSide) {
    const path = side.path;
    if (!path) return;
    files.revision(parent_path(path));
    untrack(() => void side.refresh().then((changed) => changed && revision++));
  }

  $effect(() => watch(left));
  $effect(() => watch(right));

  $effect(() => win.set_dirty(dirty, { save: save_all }));
  $effect(() => win.set_title(left.name && right.name ? `${left.name} ↔ ${right.name}` : (left.name ?? right.name ?? null)));

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `diff.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("next", "f7", "Next change", () => go(goToNextChunk)),
      scoped("previous", "shift+f7", "Previous change", () => go(goToPreviousChunk)),
      scoped("save", "mod+s", "Save", save_all),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  untrack(() => {
    const first = left_prop ?? path_prop;
    void Promise.all([first && load_into(left, first), right_prop && load_into(right, right_prop)]).then(() => (loading = false));
  });

  const summary_label = $derived.by(() => {
    if (summary.changes > 0) return `${summary.changes} ${summary.changes === 1 ? "change" : "changes"}`;
    return left.empty && right.empty ? "Nothing to compare" : "No differences";
  });
</script>

{#snippet header(side: DiffSide, role: string, tone: "a" | "b")}
  <div class={cn("flex min-h-9 min-w-0 items-center gap-1 py-0.5 pr-1 pl-3", tone === "b" && "border-t border-foreground/8 @lg:border-t-0 @lg:border-l")}>
    <span class={cn("size-2 shrink-0 rounded-full", tone === "a" ? "bg-error" : "bg-success")}></span>
    <span class="ml-1 shrink-0 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{role}</span>
    <span class="ml-1.5 min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80" title={side.path ?? side.name ?? undefined}>
      {side.name ?? "Empty"}
    </span>
    {#if side.dirty}<span class="size-1.5 shrink-0 rounded-full bg-primary" title="Unsaved changes"></span>{/if}
    {#if side.read_only}<LockSimpleIcon class="size-3.5 shrink-0 text-foreground/65" weight="fill" aria-label="Read-only system file" />{/if}
    <IconButton label="Open the {role.toLowerCase()} file…" size="sm" onclick={() => open_file(side, role)}><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Open the {role.toLowerCase()} file from device…" size="sm" onclick={() => open_device(side)}><DevicesIcon weight="bold" /></IconButton>
    <IconButton label="Paste as the {role.toLowerCase()} text" size="sm" onclick={() => paste(side)}><ClipboardTextIcon weight="bold" /></IconButton>
    {#if side.path && !side.read_only}
      <IconButton label="Save {side.name}" size="sm" disabled={!side.dirty} onclick={() => save_side(side)}><FloppyDiskIcon weight="bold" /></IconButton>
    {/if}
  </div>
{/snippet}

<div class="flex h-full flex-col" bind:clientWidth={width}>
  <Toolbar>
    <Segmented
      size="sm"
      class="hidden @lg:inline-flex"
      label="Layout"
      bind:value={() => mode, set_mode}
      options={[
        { value: DiffMode.SPLIT, label: "Split", icon: ColumnsIcon },
        { value: DiffMode.UNIFIED, label: "Unified", icon: RowsIcon },
      ]}
    />
    <Select
      class="w-28 @lg:hidden"
      size="sm"
      aria-label="Layout"
      bind:value={() => mode, set_mode}
      options={[
        { value: DiffMode.SPLIT, label: "Split" },
        { value: DiffMode.UNIFIED, label: "Unified" },
      ]}
    />
    <Separator vertical class="hidden @md:block" />
    <IconButton label="Previous change (Shift+F7)" size="sm" disabled={summary.changes === 0} onclick={() => go(goToPreviousChunk)}>
      <CaretUpIcon weight="bold" />
    </IconButton>
    <IconButton label="Next change (F7)" size="sm" disabled={summary.changes === 0} onclick={() => go(goToNextChunk)}>
      <CaretDownIcon weight="bold" />
    </IconButton>
    <span class="flex-1"></span>
    <IconButton label="Swap sides" size="sm" onclick={swap}><ArrowsLeftRightIcon weight="bold" /></IconButton>
    <Separator vertical class="hidden @md:block" />
    <IconButton label="Collapse unchanged lines" size="sm" pressed={collapse.value} onclick={() => (collapse.value = !collapse.value)}>
      <ArrowsInLineVerticalIcon weight="bold" />
    </IconButton>
    <IconButton label="Ignore whitespace" size="sm" pressed={ignore_space.value} onclick={() => (ignore_space.value = !ignore_space.value)}>
      <ParagraphIcon weight="bold" />
    </IconButton>
    <IconButton label="Wrap lines" size="sm" pressed={wrap.value} onclick={() => (wrap.value = !wrap.value)}>
      <TextAlignLeftIcon weight="bold" />
    </IconButton>
  </Toolbar>

  <div class="grid shrink-0 border-b border-foreground/8 bg-background-light @lg:grid-cols-2">
    {@render header(left, "Original", "a")}
    {@render header(right, "Changed", "b")}
  </div>

  <div class="relative min-h-0 flex-1 bg-background">
    <div bind:this={host} onclickcapture={expand_collapsed} class="h-full [&_.cm-mergeView]:h-full"></div>
    {#if loading}
      <div class="absolute inset-0 grid place-items-center bg-background"><Spinner label="Reading files" /></div>
    {:else if show_empty}
      <div class="absolute inset-0 bg-background">
        <EmptyState icon={GitDiffIcon} title="Compare two texts" description="Open two files, or paste the original and the changed text.">
          {#snippet actions()}
            <Button variant="primary" onclick={open_both}><FolderOpenIcon weight="bold" /> Open files…</Button>
            <Button onclick={open_both_device}><DevicesIcon weight="bold" /> From device…</Button>
            <Button onclick={start_typing}><ClipboardTextIcon weight="bold" /> Paste text</Button>
          {/snippet}
        </EmptyState>
      </div>
    {/if}
  </div>

  <StatusBar>
    <span>{summary_label}</span>
    {#if summary.changes > 0}
      <span class="shrink-0 text-error">−{summary.removed}</span>
      <span class="-ml-2 shrink-0 text-success">+{summary.added}</span>
    {/if}
    {#if ignore_space.value}<span class="hidden @sm:inline">Whitespace ignored</span>{/if}
    <span class="ml-auto hidden @md:inline">{left.text.split("\n").length} ↔ {right.text.split("\n").length} lines</span>
  </StatusBar>
</div>

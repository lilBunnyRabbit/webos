<script lang="ts">
  import kernel, {
    NotificationType,
    ShortcutCategory,
    type ClipboardService,
    type DialogsService,
    type FilesService,
    type NotificationsService,
    type ShortcutsService,
  } from "$lib/core/api";
  import { is_system_path, PATHS } from "$lib/core/api/services/files/hierarchy";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { Language, load_language, token_highlight, token_theme } from "$kit/components/code";
  import { Button, EmptyState, IconButton, Segmented, Select, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { cn, error_message } from "$lib/core/utils";
  import { indentWithTab } from "@codemirror/commands";
  import { Compartment, EditorState } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { basicSetup } from "codemirror";
  import {
    FilePlus as FilePlusIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    LinkSimple as LinkSimpleIcon,
    LinkBreak as LinkBreakIcon,
    ListChecks as ListChecksIcon,
    Robot as RobotIcon,
    Sparkle as SparkleIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import {
    add_response,
    ANSWERS_EXTENSION,
    answer_columns,
    empty_answers,
    FORM_EXTENSION,
    form_stem,
    has_response,
    parse_answers,
    remove_response,
    serialize_answers,
    stem_from_title,
    to_csv,
    with_extension,
    with_form_extension,
    type AnswersFile,
  } from "./answers";
  import AnswersView from "./answers-view.svelte";
  import FillView from "./fill-view.svelte";
  import { read_answers, store_answer, StoreOutcome, write_text } from "./collect";
  import { AI_PROMPT, EXAMPLE, parse_form, questions, with_form_id } from "./form";
  import FormsHome from "./forms-home.svelte";
  import { app_link, form_payload, read_answer_code, read_answer_payload, read_form_payload, type SharedAnswer } from "./link";
  import LinkBox from "./link-box.svelte";
  import type { FormsProps } from "./props";
  import { report_error } from "$kit/utils/report-error";

  const { path: initial_path, f, a }: Partial<FormsProps> = $props();

  const { app_id, window_id, window: win, storage } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));

  const View = { BUILD: "build", FILL: "fill", ANSWERS: "answers" } as const;
  type View = (typeof View)[keyof typeof View];
  const VIEW_OPTIONS: { value: View; label: string }[] = [
    { value: View.BUILD, label: "Build" },
    { value: View.FILL, label: "Fill" },
    { value: View.ANSWERS, label: "Answers" },
  ];

  const Status = { EMPTY: "empty", LOADING: "loading", READY: "ready", MISSING: "missing", ERROR: "error", BROKEN: "broken" } as const;
  type Status = (typeof Status)[keyof typeof Status];

  const NEW_FORM = "# New form\n\n- [ ] First question\n";

  const is_answers_name = (name: string) => name.toLowerCase().endsWith(ANSWERS_EXTENSION);

  const view = storage.window<View>(
    "view",
    untrack(() => (a ? View.ANSWERS : f ? View.FILL : initial_path && is_answers_name(initial_path) ? View.ANSWERS : View.BUILD)),
    z.enum(View)
  );
  const doc_path = storage.window<string | null>(
    "path",
    untrack(() => initial_path ?? null),
    z.string().nullable()
  );
  // The answers file a link's answer was saved into, when no form file names one.
  const chosen_answers = storage.window<string | null>("answers", null, z.string().nullable());
  // Cleared by New and Open: the window then no longer shows what its link carried.
  const from_link = storage.window("link", true, z.boolean());
  const folder = storage.persisted("folder", PATHS.documents, z.string());
  const respondent = storage.persisted("respondent", "", z.string());

  let status = $state<Status>(Status.LOADING);
  let error = $state("");
  let source = $state.raw("");
  let saved_source = $state.raw("");
  let link_name = $state<string | null>(null);
  let device_name = $state<string | null>(null);
  let incoming = $state.raw<SharedAnswer | null>(null);
  let answers_file = $state.raw<AnswersFile | null>(null);
  let share_open = $state(false);
  let share_link = $state<string | null>(null);
  let base_modified = 0;
  let load_id = 0;
  let editor = $state.raw<EditorView | null>(null);
  const language_slot = new Compartment();

  const path = $derived(doc_path.value);
  const answers_doc = $derived(path !== null && is_answers_name(path));
  const form_path = $derived(path && !answers_doc ? path : null);
  const form = $derived(parse_form(source));
  const stem = $derived(
    form_path ? form_stem(base_name(form_path)) : path ? form_stem(base_name(path)) : (link_name ?? (device_name ? form_stem(device_name) : stem_from_title(form.title)))
  );
  const answers_path = $derived(
    answers_doc ? path : (chosen_answers.value ?? (form_path ? `${parent_path(form_path)}/${stem}${ANSWERS_EXTENSION}`.replace(/^\/\//, "/") : null))
  );
  const name = $derived(path ? base_name(path) : `${stem}${FORM_EXTENSION}`);
  const dirty = $derived(status === Status.READY && source !== saved_source);
  const ready = $derived(status === Status.READY);
  const responses = $derived(answers_file?.responses ?? []);
  const incoming_saved = $derived(incoming !== null && answers_file !== null && has_response(answers_file, incoming.response));

  function mount(host: HTMLElement) {
    const instance = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: untrack(() => source),
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          token_theme,
          token_highlight,
          EditorView.lineWrapping,
          language_slot.of([]),
          EditorView.contentAttributes.of({ "aria-label": "Form source" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) source = update.state.doc.toString();
          }),
        ],
      }),
    });
    editor = instance;
    void load_language(Language.MARKDOWN).then((support) => {
      if (editor === instance) instance.dispatch({ effects: language_slot.reconfigure(support) });
    });
    return () => {
      instance.destroy();
      if (editor === instance) editor = null;
    };
  }

  function set_source(content: string) {
    source = content;
    saved_source = content;
    if (!editor) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: content }, selection: { anchor: 0 } });
    editor.scrollDOM.scrollTop = 0;
  }

  async function boot() {
    const id = ++load_id;
    if (a && from_link.value) {
      incoming = await read_answer_payload(a);
      if (id !== load_id) return;
      if (incoming) link_name = incoming.name;
    }
    if (path) return load(path);
    if (incoming) return show(incoming.source);
    if (f && from_link.value) {
      const shared = await read_form_payload(f);
      if (id !== load_id) return;
      if (shared) {
        link_name = shared.name;
        return show(shared.source);
      }
    }
    status = a || (f && from_link.value) ? Status.BROKEN : Status.EMPTY;
  }

  function show(content: string) {
    set_source(content);
    status = Status.READY;
  }

  async function load(target: string) {
    const id = ++load_id;
    status = Status.LOADING;
    try {
      const file = await files.get_file(target);
      if (id !== load_id) return;
      doc_path.value = target;
      device_name = null;
      if (!file) {
        status = Status.MISSING;
        return;
      }
      const text = await file.text();
      if (id !== load_id) return;
      base_modified = file.lastModified;
      if (is_answers_name(target)) {
        const parsed = parse_answers(text);
        if (!parsed) throw new Error("This isn't an answers file Forms can read.");
        answers_file = parsed;
        show(parsed.form);
      } else {
        folder.value = parent_path(target);
        show(text);
      }
    } catch (reason) {
      if (id !== load_id) return;
      error = error_message(reason);
      status = Status.ERROR;
    }
  }

  untrack(() => void boot());

  async function discard_ok(): Promise<boolean> {
    return !dirty || confirm_discard(win, name);
  }

  function leave_link() {
    from_link.value = false;
    incoming = null;
    link_name = null;
    chosen_answers.value = null;
  }

  async function start(content: string) {
    if (await discard_ok()) begin(content);
  }

  function begin(content: string, file_name: string | null = null) {
    load_id++;
    leave_link();
    doc_path.value = null;
    device_name = file_name;
    answers_file = null;
    base_modified = 0;
    show(content);
    view.value = View.BUILD;
    editor?.focus();
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({
      accept: [FORM_EXTENSION, ANSWERS_EXTENSION, ".md"],
      start_path: path ? parent_path(path) : folder.value,
      title: "Open in Forms",
    });
    if (!chosen) return;
    leave_link();
    answers_file = null;
    view.value = is_answers_name(chosen) ? View.ANSWERS : View.BUILD;
    await load(chosen);
  }

  async function write_form(target: string): Promise<boolean> {
    try {
      if (target === form_path) {
        const disk = await files.get_file(target);
        if (disk && disk.lastModified > base_modified && (await disk.text()) !== source) {
          const overwrite = await win.confirm(`“${name}” changed on disk`, {
            detail: "Saving replaces the newer version with yours.",
            confirm_label: "Overwrite",
            danger: true,
          });
          if (!overwrite) return false;
        }
      }
      const content = source;
      await write_text(target, content);
      base_modified = (await files.get_file(target))?.lastModified ?? Date.now();
      if (answers_doc && path) chosen_answers.value = path;
      saved_source = content;
      doc_path.value = target;
      device_name = null;
      folder.value = parent_path(target);
      return true;
    } catch (reason) {
      report_error(app_id, "Couldn't save the form", reason);
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const target = await win.pick_save({
      name: `${stem}${FORM_EXTENSION}`,
      accept: [FORM_EXTENSION],
      start_path: form_path && !is_system_path(form_path) ? parent_path(form_path) : folder.value,
      title: "Save the form",
    });
    return target ? write_form(with_form_extension(target)) : false;
  }

  function save(): Promise<boolean> {
    return form_path && !is_system_path(form_path) ? write_form(form_path) : save_as();
  }

  async function write_answers(target: string, next: AnswersFile) {
    await write_text(target, serialize_answers(next));
    answers_file = next;
  }

  async function save_incoming() {
    if (!incoming) return;
    let target = answers_path;
    if (!target) {
      const chosen = await win.pick_save({
        name: `${stem}${ANSWERS_EXTENSION}`,
        accept: [ANSWERS_EXTENSION],
        start_path: folder.value,
        title: "Save the answer",
      });
      if (!chosen) return;
      target = with_extension(chosen, ANSWERS_EXTENSION);
    }
    try {
      const existing = await read_answers(target);
      if (existing === null) {
        const replace = await win.confirm(`Replace “${base_name(target)}”?`, {
          detail: "It isn't an answers file Forms can read, so saving replaces it.",
          confirm_label: "Replace",
          danger: true,
        });
        if (!replace) return;
      }
      const { file } = add_response(existing ?? empty_answers(incoming.source), incoming.source, incoming.response);
      await write_answers(target, file);
      if (target !== answers_path) chosen_answers.value = target;
      folder.value = parent_path(target);
    } catch (reason) {
      report_error(app_id, "Couldn't save the answer", reason);
    }
  }

  /** Stamps the form's id before it goes out, so answer codes find this file again; a shared form has to be saved. */
  async function toggle_share() {
    if (share_open) {
      share_open = false;
      return;
    }
    const stamped = with_form_id(source);
    if (stamped !== source) {
      if (editor) editor.dispatch({ changes: { from: 0, insert: stamped.slice(0, stamped.length - source.length) } });
      else source = stamped;
    }
    if ((!form_path || dirty) && !(await save())) return;
    share_open = true;
  }

  async function add_answer(text: string): Promise<boolean> {
    const pasted = await read_answer_code(text);
    if (!pasted) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "That isn't an answer code", message: "Paste the code someone sent back after filling in your form." });
      return false;
    }

    let result;
    try {
      result = await store_answer(pasted);
    } catch (reason) {
      report_error(app_id, "Couldn't save the answer", reason);
      return false;
    }

    if (result.outcome === StoreOutcome.NO_FORM) {
      // An old answer carries its form, so it can still be read and saved by hand.
      if (pasted.source !== null && (await discard_ok())) {
        load_id++;
        leave_link();
        doc_path.value = null;
        answers_file = null;
        incoming = { source: pasted.source, name: pasted.name, response: pasted.response };
        link_name = pasted.name;
        show(pasted.source);
        view.value = View.ANSWERS;
        return true;
      }
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "No form matches this answer", message: "Its form isn't anywhere in /home on this device." });
      return false;
    }
    if (result.outcome === StoreOutcome.UNREADABLE) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: `“${base_name(result.answers_path)}” isn't an answers file Forms can read`, message: "Move it away and paste the code again." });
      return false;
    }

    if (result.form_path !== form_path && (await discard_ok())) {
      leave_link();
      answers_file = null;
      await load(result.form_path);
    }
    view.value = View.ANSWERS;
    const who = pasted.response.respondent;
    notifications.notify(app_id, {
      type: NotificationType.INFO,
      title: result.outcome === StoreOutcome.SAVED ? `Saved ${who ? `${who}'s` : "an"} answer` : "Already saved",
      message: `${result.count} ${result.count === 1 ? "answer" : "answers"} in ${base_name(result.answers_path)}`,
    });
    return true;
  }

  let root = $state<HTMLElement>();

  // A code pasted anywhere in the window adds it, except into a text field, where it's just text.
  function on_paste(event: ClipboardEvent) {
    if (!win.is_focused || dialogs.system.length > 0 || dialogs.for_window(window_id).length > 0) return;
    const target = event.target;
    if (target instanceof Node && target !== document.body && !root?.contains(target)) return;
    if (target instanceof HTMLElement && target.closest("input, textarea, [contenteditable]")) return;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!/(^|[?&]a=)v1[\w-]{8,}/.test(text.trim())) return;
    event.preventDefault();
    void add_answer(text);
  }

  async function remove(index: number) {
    if (!answers_file || !answers_path) return;
    const response = answers_file.responses[index];
    const ok = await win.confirm(`Remove the answer from “${response?.respondent ?? `Answer ${index + 1}`}”?`, {
      detail: `It's deleted from ${base_name(answers_path)}.`,
      confirm_label: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await write_answers(answers_path, remove_response(answers_file, index));
    } catch (reason) {
      report_error(app_id, "Couldn't remove the answer", reason);
    }
  }

  async function export_csv() {
    const target = await win.pick_save({
      name: `${stem}.csv`,
      accept: [".csv"],
      start_path: answers_path ? parent_path(answers_path) : folder.value,
      title: "Export answers as CSV",
    });
    if (!target) return;
    try {
      await write_text(with_extension(target, ".csv"), to_csv(answer_columns(form, responses), responses));
    } catch (reason) {
      report_error(app_id, "Couldn't export the answers", reason);
    }
  }

  async function copy_prompt() {
    try {
      await clipboard.copy_text(AI_PROMPT);
      notifications.notify(app_id, { type: NotificationType.INFO, title: "Prompt copied", message: "Give it to any AI chat with what the form is for, then paste the answer here." });
    } catch (reason) {
      report_error(app_id, "Couldn't copy to the clipboard", reason);
    }
  }

  $effect(() => {
    if (!share_open || !ready) return;
    const shared = { source, name: stem };
    let current = true;
    const timer = setTimeout(async () => {
      const payload = await form_payload(shared);
      if (current) share_link = app_link({ f: payload });
    }, untrack(() => share_link) ? 250 : 0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  });

  $effect(() => {
    const target = answers_path;
    if (!target) {
      if (!answers_doc) answers_file = null;
      return;
    }
    files.revision(parent_path(target));
    let current = true;
    void read_answers(target).then((parsed) => {
      if (current) answers_file = parsed ?? null;
    });
    return () => {
      current = false;
    };
  });

  // A save from anywhere (another window, Explorer) bumps the folder's revision; a clean form follows it.
  $effect(() => {
    const target = form_path;
    if (!target || status !== Status.READY) return;
    files.revision(parent_path(target));
    untrack(() => {
      if (dirty) return;
      void files.get_file(target).then(async (file) => {
        if (!file || target !== form_path || dirty || file.lastModified <= base_modified) return;
        const content = await file.text();
        if (target !== form_path || dirty) return;
        base_modified = file.lastModified;
        if (content !== source) set_source(content);
      });
    });
  });

  $effect(() => win.set_title(status === Status.EMPTY ? null : name));
  $effect(() => win.set_dirty(dirty, { save }));

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `forms.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [scoped("open", "mod+o", "Open…", open), scoped("save", "mod+s", "Save", save), scoped("save-as", "mod+shift+s", "Save as…", save_as)];
    return () => disposers.forEach((dispose) => dispose());
  });
</script>

<svelte:document onpaste={on_paste} />

<div bind:this={root} class="grid h-full grid-rows-[auto_auto_1fr_auto]">
  <Toolbar>
    <IconButton label="New form" size="sm" onclick={() => start(NEW_FORM)}><FilePlusIcon weight="bold" /></IconButton>
    <IconButton label="Open…" size="sm" onclick={open}><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Save" size="sm" disabled={!ready} onclick={save}><FloppyDiskIcon weight="bold" /></IconButton>
    <IconButton label="Save as…" size="sm" disabled={!ready} onclick={save_as}><FloppyDiskBackIcon weight="bold" /></IconButton>
    <Separator vertical class="hidden @md:block" />
    <Segmented size="sm" label="View" bind:value={view.value} options={VIEW_OPTIONS} class="ml-auto hidden @md:inline-flex" />
    <Select size="sm" aria-label="View" bind:value={view.value} options={VIEW_OPTIONS} class="ml-auto w-24 @md:hidden" />
    <Button size="sm" variant={share_open ? "primary" : "secondary"} disabled={!ready} aria-pressed={share_open} aria-label="Share link" title="Share link" onclick={() => void toggle_share()}>
      <LinkSimpleIcon weight="bold" /><span class="hidden @md:inline">Share</span>
    </Button>
  </Toolbar>

  <div>
    {#if share_open && ready}
      <div class="border-b border-hairline bg-background-light px-3 py-3">
        <div class="mx-auto max-w-3xl">
          {#if share_link}
            <LinkBox link={share_link} label="Form link: anyone who opens it can fill it in" />
          {:else}
            <Spinner label="Packing the form" />
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <div class="relative min-h-0">
    {#if view.value === View.BUILD}
      <div class="grid h-full min-h-0 grid-rows-2 @2xl:grid-cols-2 @2xl:grid-rows-1">
        <div class="flex min-h-0 min-w-0 flex-col">
          <div class="flex items-center justify-end gap-1 border-b border-hairline px-2 py-1">
            <span class="mr-auto hidden truncate px-1 text-2xs text-foreground/65 @4xl:inline">
              <code class="font-mono">- [ ]</code> tick · <code class="font-mono">- [_]</code> short · <code class="font-mono">- [...]</code> long · <code class="font-mono">| note</code>
            </span>
            <Button size="sm" variant="quiet" onclick={() => start(EXAMPLE)}><SparkleIcon weight="bold" /> Example</Button>
            <Button size="sm" variant="quiet" onclick={copy_prompt}><RobotIcon weight="bold" /> AI prompt</Button>
          </div>
          <div class="min-h-0 flex-1" {@attach mount}></div>
        </div>
        <div class="min-h-0 overflow-auto border-t border-hairline bg-background-darker @2xl:border-t-0 @2xl:border-l">
          <FillView {form} shared={{ source, name: stem }} preview />
        </div>
      </div>
    {:else if view.value === View.FILL}
      <div class="h-full overflow-auto">
        <FillView {form} shared={{ source, name: stem }} bind:respondent={respondent.value} />
      </div>
    {:else}
      <div class="h-full overflow-auto">
        <AnswersView
          {form}
          {responses}
          incoming={incoming?.response ?? null}
          {incoming_saved}
          target={answers_path ? base_name(answers_path) : null}
          onsave={save_incoming}
          onremove={remove}
          onexport={export_csv}
          onadd={add_answer}
        />
      </div>
    {/if}

    {#if status !== Status.READY}
      <div class="absolute inset-0 z-20 grid bg-background">
        {#if status === Status.EMPTY}
          <div class="h-full overflow-auto">
            <div class="flex min-h-full flex-col justify-center">
          <EmptyState icon={ListChecksIcon} class="h-auto" title="Make a form" description="Write it as a checklist, share it as a link, and paste the answer codes people send back.">
            {#snippet actions()}
              <div class="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onclick={() => start(NEW_FORM)}><FilePlusIcon weight="bold" /> New form</Button>
                <Button onclick={open}><FolderOpenIcon weight="bold" /> Open…</Button>
                <Button variant="quiet" onclick={() => start(EXAMPLE)}><SparkleIcon weight="bold" /> Example</Button>
              </div>
            {/snippet}
          </EmptyState>
          <FormsHome onopen={(target) => void load(target)} onadd={add_answer} />
            </div>
          </div>
        {:else if status === Status.LOADING}
          <div class="grid place-items-center"><Spinner label="Opening" /></div>
        {:else if status === Status.BROKEN}
          <EmptyState icon={LinkBreakIcon} tone="error" title="This link is broken" description="Part of it is missing, or it was cut off when it was sent. Ask for the link again.">
            {#snippet actions()}
              <Button onclick={() => start(NEW_FORM)}><FilePlusIcon weight="bold" /> New form</Button>
            {/snippet}
          </EmptyState>
        {:else}
          <EmptyState
            icon={WarningCircleIcon}
            tone="error"
            title={status === Status.MISSING ? "File not found" : "Couldn't read the file"}
            description={status === Status.MISSING ? (path ?? "") : error}
          >
            {#snippet actions()}
              <Button variant="primary" onclick={open}><FolderOpenIcon weight="bold" /> Open…</Button>
            {/snippet}
          </EmptyState>
        {/if}
      </div>
    {/if}
  </div>

  <StatusBar>
    <span class={cn("truncate", !ready && "text-foreground/65")}>{ready ? name : "No form"}</span>
    {#if ready}
      <span class="ml-auto shrink-0">{questions(form).length} {questions(form).length === 1 ? "question" : "questions"}</span>
      <span class="hidden shrink-0 @sm:inline">{responses.length} {responses.length === 1 ? "answer" : "answers"}</span>
    {/if}
  </StatusBar>
</div>

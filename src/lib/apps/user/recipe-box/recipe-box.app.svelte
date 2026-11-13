<script lang="ts">
  import kernel, { ShortcutCategory, type DialogsService, type FilesService, type MenuItem, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import ConfirmDialog from "$lib/core/components/dialogs/confirm-dialog.svelte";
  import PromptDialog from "$lib/core/components/dialogs/prompt-dialog.svelte";
  import { CodeView } from "$kit/components/code";
  import { base_name, parent_path, tilde_path } from "$lib/core/api/services/files/path";
  import { Button, EmptyState, IconButton, Segmented, Select, Spinner, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { cn, error_message } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import type { Position } from "$lib/core/utils/type";
  import {
    ArrowLeft as ArrowLeftIcon,
    ClipboardText as ClipboardTextIcon,
    Devices as DevicesIcon,
    DotsThree as DotsThreeIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    FolderSimple as FolderSimpleIcon,
    PencilSimple as PencilSimpleIcon,
    Plus as PlusIcon,
    Trash as TrashIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { empty_storage, storage_schema } from "./storage";
  import { APP_ID, COOK_FILES } from "./constants";
  import CookMode from "./cook-mode.svelte";
  import { is_favorite, parse_cook, recipe_servings, recipe_tags, recipe_title } from "./cooklang";
  import { all_tags, ensure_folder, list_recipes } from "./library";
  import LibraryView from "./library-view.svelte";
  import { parse_pasted, pasted_cook, pasted_form } from "./paste";
  import PasteDialog from "./paste-dialog.svelte";
  import { empty_form, form_from_cook, form_issues, form_to_cook, set_meta, with_favorite, type FormIssue, type RecipeForm } from "./recipe-form";
  import RecipeFormView from "./recipe-form.svelte";
  import RecipeView from "./recipe-view.svelte";
  import ScaleControls from "./scale-controls.svelte";
  import TableView from "./table-view.svelte";
  import { CookTimers } from "./timers.svelte";
  import { report_error } from "$kit/utils/report-error";

  const { path: initial_path }: { path?: string } = $props();

  const { window_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  const View = { LIBRARY: "library", RECIPE: "recipe", TABLE: "table", COOK: "cook", EDIT: "edit" } as const;
  type View = (typeof View)[keyof typeof View];
  type RecipeView = Exclude<View, typeof View.LIBRARY>;
  const Editor = { FORM: "form", SOURCE: "source" } as const;
  type Editor = (typeof Editor)[keyof typeof Editor];
  const EditPanel = { EDITOR: "editor", PREVIEW: "preview" } as const;
  type EditPanel = (typeof EditPanel)[keyof typeof EditPanel];
  type NarrowPanel = Editor | typeof EditPanel.PREVIEW;

  const EDITORS: { value: Editor; label: string }[] = [
    { value: Editor.FORM, label: "Form" },
    { value: Editor.SOURCE, label: "Source" },
  ];
  const NARROW_PANELS: { value: NarrowPanel; label: string }[] = [...EDITORS, { value: EditPanel.PREVIEW, label: "Preview" }];

  const VIEWS: { value: RecipeView; label: string }[] = [
    { value: View.RECIPE, label: "Recipe" },
    { value: View.TABLE, label: "Table" },
    { value: View.COOK, label: "Cook" },
    { value: View.EDIT, label: "Edit" },
  ];

  const prefs = storage.file("storage.json", empty_storage(), storage_schema);

  let view = $state<View>(View.LIBRARY);
  let path = $state<string | null>(null);
  let text = $state("");
  let saved_text = $state("");
  let loading = $state(false);
  let load_error = $state<string | null>(null);
  let amount = $state(1);
  let editor = $state<Editor>(Editor.FORM);
  let edit_panel = $state<EditPanel>(EditPanel.EDITOR);
  let form = $state<RecipeForm>(empty_form());
  let issues = $state<FormIssue[]>([]);
  let known_tags = $state<string[]>([]);
  let cook_index = $state(0);
  let cook = $state<{ go(delta: number): void } | null>(null);

  const recipe = $derived(parse_cook(text));
  const name = $derived(path ? base_name(path) : "");
  const title = $derived(recipe_title(recipe, name) || "New recipe");
  const tags = $derived(recipe_tags(recipe));
  const base = $derived(recipe_servings(recipe));
  const factor = $derived(amount / (base ?? 1));
  const dirty = $derived(text !== saved_text);

  const timers = new CookTimers(
    () => (path ? { title, path } : null),
    () => win.is_visible
  );

  function refresh_tags() {
    void list_recipes(prefs.value.folder).then(
      (entries) => (known_tags = all_tags(entries)),
      () => {}
    );
  }

  function enter_form() {
    form = form_from_cook(text);
    issues = form_issues(text);
    refresh_tags();
  }

  function form_changed() {
    text = form_to_cook(form);
  }

  function set_view(next: View) {
    if (next === View.EDIT && view !== View.EDIT && editor === Editor.FORM) enter_form();
    view = next;
  }

  function set_editor(next: Editor) {
    if (next === Editor.FORM && editor !== Editor.FORM) enter_form();
    editor = next;
    edit_panel = EditPanel.EDITOR;
  }

  async function load(target: string, next: View = View.RECIPE) {
    loading = true;
    load_error = null;
    view = next;
    try {
      const file = await files.get_file(target);
      if (!file) throw new Error(`File not found: ${target}`);
      const content = await file.text();
      text = content;
      saved_text = content;
      path = target;
      amount = recipe_servings(parse_cook(content)) ?? 1;
      cook_index = 0;
      if (view === View.EDIT && editor === Editor.FORM) enter_form();
    } catch (reason) {
      load_error = error_message(reason);
    } finally {
      loading = false;
    }
  }

  const initial = untrack(() => initial_path);
  if (initial) void load(initial);

  async function discard_ok() {
    return !dirty || confirm_discard(win, name);
  }

  async function open_path(target: string) {
    if (target === path && !load_error) {
      view = View.RECIPE;
      return;
    }
    if (!(await discard_ok())) return;
    await load(target);
  }

  async function to_library() {
    if (!(await discard_ok())) return;
    text = saved_text;
    view = View.LIBRARY;
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({ accept: COOK_FILES, start_path: path ? parent_path(path) : prefs.value.folder, title: "Open in Recipe Box" });
    if (chosen) await load(chosen);
  }

  async function folder_handle() {
    await ensure_folder(prefs.value.folder);
    const directory = await files.get_directory(prefs.value.folder);
    if (!directory) throw new Error(`Folder not found: ${prefs.value.folder}`);
    return directory;
  }

  async function new_recipe() {
    if (!(await discard_ok())) return;
    start_draft(empty_form(), false);
  }

  async function paste_recipe() {
    if (!(await discard_ok())) return;
    const pasted = await dialogs.show(PasteDialog, {}, { window: window_id });
    if (pasted === null) return;
    const cook = pasted_cook(pasted);
    if (cook) draft_source(cook);
    else start_draft(pasted_form(parse_pasted(pasted)), true);
  }

  function draft_source(source: string) {
    start_draft(form_from_cook(source), false);
    text = source;
    issues = form_issues(source);
    amount = recipe_servings(parse_cook(source)) ?? 1;
    view = View.RECIPE;
  }

  function start_draft(next: RecipeForm, changed: boolean) {
    path = null;
    load_error = null;
    saved_text = "";
    form = next;
    issues = [];
    text = changed ? form_to_cook(next) : "";
    amount = recipe_servings(parse_cook(text)) ?? 1;
    cook_index = 0;
    editor = Editor.FORM;
    edit_panel = EditPanel.EDITOR;
    view = View.EDIT;
    refresh_tags();
  }

  async function import_device() {
    if (!(await discard_ok())) return;
    const picked = await pick_device_files({ accept: COOK_FILES, multiple: true });
    if (picked.length === 0) return;
    try {
      const directory = await folder_handle();
      const created: string[] = [];
      for (const file of picked) created.push((await files.create_file(directory, file.name, { content: await file.text() })).name);
      if (created.length === 1) await load(`${prefs.value.folder}/${created[0]}`);
      else notifications.notify(APP_ID, { title: `Imported ${created.length} recipes`, message: tilde_path(prefs.value.folder) });
    } catch (reason) {
      report_error(APP_ID, "Couldn't import the recipes", reason);
    }
  }

  async function change_folder() {
    const chosen = await win.pick_directory({ start_path: prefs.value.folder, title: "Recipes folder" });
    if (chosen) prefs.value.folder = chosen;
  }

  async function write(target: string, content: string) {
    const directory = await files.get_directory(parent_path(target));
    if (!directory) throw new Error(`Folder not found: ${parent_path(target)}`);
    await files.create_file(directory, base_name(target), { content, overwrite: true });
  }

  let saving: Promise<boolean> | null = null;

  function save(): Promise<boolean> {
    if (!path && !dirty) return Promise.resolve(false);
    saving ??= write_out().finally(() => (saving = null));
    return saving;
  }

  async function write_out(): Promise<boolean> {
    try {
      const content = text;
      if (path) {
        await write(path, content);
      } else {
        const handle = await files.create_file(await folder_handle(), cook_file_name(recipe_title(recipe, "")), { content });
        path = `${prefs.value.folder}/${handle.name}`;
      }
      saved_text = content;
      return true;
    } catch (reason) {
      report_error(APP_ID, "Couldn't save the recipe", reason);
      return false;
    }
  }

  function cook_file_name(recipe_name: string): string {
    return `${(recipe_name.trim() || "Recipe").replace(/[/\\]/g, "-")}.cook`;
  }

  async function rename_path(target: string) {
    const open_here = target === path;
    try {
      const read = async () => {
        const file = await files.get_file(target);
        if (!file) throw new Error(`File not found: ${target}`);
        return file.text();
      };
      const current = recipe_title(parse_cook(open_here ? text : await read()), base_name(target));
      const entered = await dialogs.show(
        PromptDialog,
        { message: "Rename recipe", initial: current, confirm_label: "Rename", validate: (value: string) => (value.trim() === "" ? "Give the recipe a name" : null) },
        { window: window_id }
      );
      const next_name = entered?.trim();
      if (!next_name || next_name === current) return;
      const content = set_meta(await read(), "title", next_name);
      const directory = await files.get_directory(parent_path(target));
      if (!directory) throw new Error(`Folder not found: ${parent_path(target)}`);
      const file_name = cook_file_name(next_name);
      const same_file = file_name.toLowerCase() === base_name(target).toLowerCase();
      const handle = await files.create_file(directory, same_file ? base_name(target) : file_name, { content, overwrite: same_file });
      if (open_here) {
        path = `${parent_path(target)}/${handle.name}`;
        text = dirty ? set_meta(text, "title", next_name) : content;
        saved_text = content;
        if (view === View.EDIT && editor === Editor.FORM) enter_form();
      }
      if (!same_file) await files.delete_entry(directory, base_name(target));
    } catch (reason) {
      report_error(APP_ID, "Couldn't rename the recipe", reason);
    }
  }

  async function delete_path(target: string) {
    const open_here = target === path;
    const shown = open_here ? title : base_name(target).replace(/\.cook$/i, "");
    const ok = await dialogs.show(
      ConfirmDialog,
      { message: `Delete “${shown}”?`, detail: "The recipe file is removed. This can't be undone.", confirm_label: "Delete", danger: true },
      { window: window_id }
    );
    if (!ok) return;
    try {
      const directory = await files.get_directory(parent_path(target));
      if (!directory) throw new Error(`Folder not found: ${parent_path(target)}`);
      await files.delete_entry(directory, base_name(target));
      if (!open_here) return;
      path = null;
      text = "";
      saved_text = "";
      view = View.LIBRARY;
    } catch (reason) {
      report_error(APP_ID, "Couldn't delete the recipe", reason);
    }
  }

  async function recipe_menu(target: string, anchor: Position) {
    const entries: MenuItem[] = [
      { id: "rename", label: "Rename…", icon: PencilSimpleIcon },
      { separator: true },
      { id: "delete", label: "Delete…", icon: TrashIcon, danger: true },
    ];
    const choice = await dialogs.menu(entries, { anchor });
    if (choice === "rename") await rename_path(target);
    else if (choice === "delete") await delete_path(target);
  }

  function more(event: MouseEvent) {
    if (!path) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    void recipe_menu(path, { x: rect.left, y: rect.bottom + 4 });
  }

  async function set_favorite(on: boolean) {
    try {
      if (path) {
        const file = await files.get_file(path);
        if (!file) throw new Error(`File not found: ${path}`);
        const next = with_favorite(await file.text(), on);
        await write(path, next);
        text = dirty ? with_favorite(text, on) : next;
        saved_text = next;
      } else {
        text = with_favorite(text, on);
      }
    } catch (reason) {
      report_error(APP_ID, "Couldn't change favourites", reason);
    }
  }

  async function favorite_path(target: string, on: boolean) {
    if (target === path) return set_favorite(on);
    try {
      const file = await files.get_file(target);
      if (!file) throw new Error(`File not found: ${target}`);
      await write(target, with_favorite(await file.text(), on));
    } catch (reason) {
      report_error(APP_ID, "Couldn't change favourites", reason);
    }
  }

  $effect(() => win.set_title(view === View.LIBRARY ? null : title));
  $effect(() => win.set_dirty(dirty, { save }));
  $effect(() =>
    win.on_back(() => {
      if (view === View.LIBRARY) return false;
      if (view === View.EDIT && edit_panel === EditPanel.PREVIEW) edit_panel = EditPanel.EDITOR;
      else if (view === View.RECIPE) void to_library();
      else view = View.RECIPE;
      return true;
    })
  );

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `recipe-box.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [scoped("save", "mod+s", "Save", () => void save())];
    if (view === View.COOK) disposers.push(scoped("next", "right", "Next step", () => cook?.go(1)), scoped("previous", "left", "Previous step", () => cook?.go(-1)));
    return () => disposers.forEach((dispose) => dispose());
  });
</script>

{#snippet controls()}
  <ScaleControls bind:amount {base} bind:system={prefs.value.units} />
{/snippet}

<div class="flex h-full flex-col">
  {#if !prefs.ready}
    <div class="grid flex-1 place-items-center"><Spinner label="Loading" /></div>
  {:else}
    <Toolbar>
      {#if view === View.LIBRARY}
        <span class="min-w-0 flex-1 truncate text-ui font-medium" title={prefs.value.folder}>
          Recipes <span class="font-mono text-2xs font-normal text-foreground/65">{tilde_path(prefs.value.folder)}</span>
        </span>
        <IconButton size="sm" label="Open…" onclick={open}><FolderOpenIcon /></IconButton>
        <IconButton size="sm" label="Import from device…" onclick={import_device}><DevicesIcon /></IconButton>
        <IconButton size="sm" label="Change recipes folder…" onclick={change_folder}><FolderSimpleIcon /></IconButton>
        <Button size="sm" onclick={paste_recipe} title="Paste a recipe"><ClipboardTextIcon /><span class="@2xl:hidden">Paste</span><span class="hidden @2xl:inline">Paste a recipe</span></Button>
        <Button size="sm" variant="primary" onclick={new_recipe}><PlusIcon />New</Button>
      {:else}
        <IconButton size="sm" label="All recipes" onclick={to_library}><ArrowLeftIcon /></IconButton>
        <span class="min-w-0 flex-1 truncate text-ui font-medium" title={path ?? undefined}>{title}{dirty ? " •" : ""}</span>
        <Segmented size="sm" label="View" options={VIEWS} bind:value={() => view as RecipeView, set_view} class="hidden @xl:inline-flex" />
        <Select size="sm" aria-label="View" class="w-auto @xl:hidden" options={VIEWS} bind:value={() => view as RecipeView, set_view} />
        {#if view === View.EDIT || dirty}
          <Button size="sm" variant="primary" disabled={!dirty} onclick={save}><FloppyDiskIcon />Save</Button>
        {/if}
        {#if path}
          <IconButton size="sm" label="Recipe actions" onclick={more}><DotsThreeIcon weight="bold" /></IconButton>
        {/if}
      {/if}
    </Toolbar>

    {#if view === View.LIBRARY}
      <LibraryView folder={prefs.value.folder} onopen={open_path} onnew={new_recipe} onpaste={paste_recipe} onfavorite={favorite_path} onmenu={recipe_menu} />
    {:else if loading}
      <div class="grid flex-1 place-items-center"><Spinner label="Opening" /></div>
    {:else if load_error}
      <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't open the recipe" description={load_error}>
        {#snippet actions()}
          <Button size="sm" onclick={open}>Open a recipe…</Button>
          <Button size="sm" variant="quiet" onclick={to_library}>All recipes</Button>
        {/snippet}
      </EmptyState>
    {:else if view === View.RECIPE}
      <div class="min-h-0 flex-1 overflow-y-auto">
        <RecipeView {recipe} {title} {tags} {factor} system={prefs.value.units} {controls} favorite={is_favorite(recipe)} onfavorite={set_favorite} />
      </div>
    {:else if view === View.TABLE}
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="px-4 pt-4 @lg:px-6">{@render controls()}</div>
        <TableView {recipe} {title} {factor} system={prefs.value.units} />
      </div>
    {:else if view === View.COOK}
      <div class="min-h-0 flex-1">
        <CookMode bind:this={cook} {recipe} {factor} system={prefs.value.units} {timers} bind:index={cook_index} />
      </div>
    {:else}
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="mx-3 mt-3 shrink-0">
          <Segmented
            size="sm"
            label="Edit panel"
            options={NARROW_PANELS}
            bind:value={() => (edit_panel === EditPanel.PREVIEW ? EditPanel.PREVIEW : editor), (next) => (next === EditPanel.PREVIEW ? (edit_panel = next) : set_editor(next))}
            class="flex *:flex-1 @4xl:hidden"
          />
          <Segmented size="sm" label="Editor" options={EDITORS} bind:value={() => editor, set_editor} class="hidden @4xl:inline-flex" />
        </div>
        <div class="grid min-h-0 flex-1 @4xl:grid-cols-2">
          <div class={cn("min-h-0 flex-col @4xl:flex @4xl:border-r @4xl:border-foreground/8", edit_panel === EditPanel.EDITOR ? "flex" : "hidden")}>
            {#if editor === Editor.FORM}
              <RecipeFormView bind:form {known_tags} {issues} onchange={form_changed} onsource={() => set_editor(Editor.SOURCE)} />
            {:else}
              <div class="flex min-h-0 flex-1 flex-col p-3">
                <CodeView value={text} label="Recipe source" onchange={(value) => (text = value)} class="min-h-0 flex-1" />
              </div>
            {/if}
          </div>
          <div class={cn("min-h-0 overflow-y-auto @4xl:block", edit_panel === EditPanel.PREVIEW ? "block" : "hidden")} aria-label="Preview">
            <RecipeView {recipe} {title} {tags} {factor} system={prefs.value.units} />
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

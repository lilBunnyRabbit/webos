<script lang="ts">
  import kernel, { NotificationType, ShortcutCategory, type FilesService, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import { CodeView } from "$kit/components/code";
  import { base_name, parent_path, tilde_path } from "$lib/core/api/services/files/path";
  import { Button, EmptyState, IconButton, Segmented, Select, Spinner, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { cn, error_message } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import {
    ArrowLeft as ArrowLeftIcon,
    Devices as DevicesIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    FolderSimple as FolderSimpleIcon,
    Plus as PlusIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { APP_ID, COOK_FILES, UnitSystem } from "./constants";
  import CookMode from "./cook-mode.svelte";
  import { parse_cook, recipe_servings, recipe_tags, recipe_title } from "./cooklang";
  import { DEFAULT_FOLDER, ensure_folder, recipe_template } from "./library";
  import LibraryView from "./library-view.svelte";
  import RecipeView from "./recipe-view.svelte";
  import ScaleControls from "./scale-controls.svelte";
  import TableView from "./table-view.svelte";
  import { CookTimers } from "./timers.svelte";

  const { path: initial_path }: { path?: string } = $props();

  const { window_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  const View = { LIBRARY: "library", RECIPE: "recipe", TABLE: "table", COOK: "cook", EDIT: "edit" } as const;
  type View = (typeof View)[keyof typeof View];
  type RecipeView = Exclude<View, typeof View.LIBRARY>;
  const EditPanel = { SOURCE: "source", PREVIEW: "preview" } as const;
  type EditPanel = (typeof EditPanel)[keyof typeof EditPanel];

  const VIEWS: { value: RecipeView; label: string }[] = [
    { value: View.RECIPE, label: "Recipe" },
    { value: View.TABLE, label: "Table" },
    { value: View.COOK, label: "Cook" },
    { value: View.EDIT, label: "Edit" },
  ];

  const folder = storage.persisted("folder", DEFAULT_FOLDER, z.string().startsWith("/"));
  const system = storage.persisted<UnitSystem>("units", UnitSystem.WRITTEN, z.enum(UnitSystem));

  let view = $state<View>(View.LIBRARY);
  let path = $state<string | null>(null);
  let text = $state("");
  let saved_text = $state("");
  let loading = $state(false);
  let load_error = $state<string | null>(null);
  let amount = $state(1);
  let edit_panel = $state<EditPanel>(EditPanel.SOURCE);
  let cook_index = $state(0);
  let cook = $state<{ go(delta: number): void } | null>(null);

  const recipe = $derived(parse_cook(text));
  const name = $derived(path ? base_name(path) : "");
  const title = $derived(recipe_title(recipe, name));
  const tags = $derived(recipe_tags(recipe));
  const base = $derived(recipe_servings(recipe));
  const factor = $derived(amount / (base ?? 1));
  const dirty = $derived(text !== saved_text);

  const timers = new CookTimers(() => title);
  $effect(() => () => timers.destroy());

  function report(title: string, reason: unknown) {
    notifications.notify(APP_ID, { type: NotificationType.ERROR, title, message: error_message(reason) });
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
    const chosen = await win.pick_file({ accept: COOK_FILES, start_path: path ? parent_path(path) : folder.value, title: "Open in Recipe Box" });
    if (chosen) await load(chosen);
  }

  async function folder_handle() {
    await ensure_folder(folder.value);
    const directory = await files.get_directory(folder.value);
    if (!directory) throw new Error(`Folder not found: ${folder.value}`);
    return directory;
  }

  async function new_recipe() {
    if (!(await discard_ok())) return;
    const chosen = await win.prompt("New recipe", {
      placeholder: "Tomato soup",
      confirm_label: "Create",
      validate: (value) => (value.trim() === "" ? "Give the recipe a name." : /[/\\]/.test(value) ? "A name can't contain / or \\." : null),
    });
    if (chosen === null) return;
    try {
      const handle = await files.create_file(await folder_handle(), `${chosen.trim()}.cook`, { content: recipe_template(chosen.trim()) });
      edit_panel = EditPanel.SOURCE;
      await load(`${folder.value}/${handle.name}`, View.EDIT);
    } catch (reason) {
      report("Couldn't create the recipe", reason);
    }
  }

  async function import_device() {
    if (!(await discard_ok())) return;
    const picked = await pick_device_files({ accept: COOK_FILES, multiple: true });
    if (picked.length === 0) return;
    try {
      const directory = await folder_handle();
      const created: string[] = [];
      for (const file of picked) created.push((await files.create_file(directory, file.name, { content: await file.text() })).name);
      if (created.length === 1) await load(`${folder.value}/${created[0]}`);
      else notifications.notify(APP_ID, { title: `Imported ${created.length} recipes`, message: tilde_path(folder.value) });
    } catch (reason) {
      report("Couldn't import the recipes", reason);
    }
  }

  async function change_folder() {
    const chosen = await win.pick_directory({ start_path: folder.value, title: "Recipes folder" });
    if (chosen) folder.value = chosen;
  }

  async function save(): Promise<boolean> {
    if (!path) return false;
    try {
      const directory = await files.get_directory(parent_path(path));
      if (!directory) throw new Error(`Folder not found: ${parent_path(path)}`);
      const content = text;
      await files.create_file(directory, base_name(path), { content, overwrite: true });
      saved_text = content;
      return true;
    } catch (reason) {
      report("Couldn't save the recipe", reason);
      return false;
    }
  }

  $effect(() => win.set_title(view === View.LIBRARY ? null : title));
  $effect(() => win.set_dirty(dirty, { save }));
  $effect(() =>
    win.on_back(() => {
      if (view === View.LIBRARY) return false;
      if (view === View.EDIT && edit_panel === EditPanel.PREVIEW) edit_panel = EditPanel.SOURCE;
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
  <ScaleControls bind:amount {base} bind:system={system.value} />
{/snippet}

<div class="flex h-full flex-col">
  <Toolbar>
    {#if view === View.LIBRARY}
      <span class="min-w-0 flex-1 truncate text-ui font-medium" title={folder.value}>
        Recipes <span class="font-mono text-2xs font-normal text-foreground/65">{tilde_path(folder.value)}</span>
      </span>
      <IconButton size="sm" label="Open…" onclick={open}><FolderOpenIcon /></IconButton>
      <IconButton size="sm" label="Import from device…" onclick={import_device}><DevicesIcon /></IconButton>
      <IconButton size="sm" label="Change recipes folder…" onclick={change_folder}><FolderSimpleIcon /></IconButton>
      <Button size="sm" variant="primary" onclick={new_recipe}><PlusIcon />New</Button>
    {:else}
      <IconButton size="sm" label="All recipes" onclick={to_library}><ArrowLeftIcon /></IconButton>
      <span class="min-w-0 flex-1 truncate text-ui font-medium" title={path ?? undefined}>{title}{dirty ? " •" : ""}</span>
      <Segmented size="sm" label="View" options={VIEWS} bind:value={() => view as RecipeView, (next) => (view = next)} class="hidden @xl:inline-flex" />
      <Select size="sm" aria-label="View" class="w-auto @xl:hidden" options={VIEWS} bind:value={() => view as RecipeView, (next) => (view = next)} />
      {#if view === View.EDIT || dirty}
        <IconButton size="sm" label="Save" disabled={!dirty} onclick={save}><FloppyDiskIcon /></IconButton>
      {/if}
    {/if}
  </Toolbar>

  {#if view === View.LIBRARY}
    <LibraryView folder={folder.value} onopen={open_path} onnew={new_recipe} />
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
      <RecipeView {recipe} {title} {tags} {factor} system={system.value} {controls} />
    </div>
  {:else if view === View.TABLE}
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="px-4 pt-4 @lg:px-6">{@render controls()}</div>
      <TableView {recipe} {title} {factor} system={system.value} />
    </div>
  {:else if view === View.COOK}
    <div class="min-h-0 flex-1">
      <CookMode bind:this={cook} {recipe} {factor} system={system.value} {timers} bind:index={cook_index} />
    </div>
  {:else}
    <div class="flex min-h-0 flex-1 flex-col">
      <Segmented
        size="sm"
        label="Edit panel"
        options={[
          { value: EditPanel.SOURCE, label: "Source" },
          { value: EditPanel.PREVIEW, label: "Preview" },
        ]}
        bind:value={edit_panel}
        class="mx-3 mt-3 shrink-0 *:flex-1 @4xl:hidden"
      />
      <div class="grid min-h-0 flex-1 @4xl:grid-cols-2">
        <div class={cn("min-h-0 flex-col p-3 @4xl:flex @4xl:border-r @4xl:border-foreground/8", edit_panel === EditPanel.SOURCE ? "flex" : "hidden")}>
          <CodeView value={text} label="Recipe source" onchange={(value) => (text = value)} class="min-h-0 flex-1" />
        </div>
        <div class={cn("min-h-0 overflow-y-auto @4xl:block", edit_panel === EditPanel.PREVIEW ? "block" : "hidden")} aria-label="Preview">
          <RecipeView {recipe} {title} {tags} {factor} system={system.value} />
        </div>
      </div>
    </div>
  {/if}
</div>

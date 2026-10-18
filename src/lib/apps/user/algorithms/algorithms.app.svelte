<script lang="ts">
  import kernel, { NotificationType, type ClipboardService, type FilesService, type NotificationsService } from "$lib/core/api";
  import { is_system_path, PATHS } from "$lib/core/api/services/files/hierarchy";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { RouteKind, route_url } from "$lib/core/api/services/router/route";
  import { EmptyState, IconButton, SideNav, Spinner, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn, error_message } from "$lib/core/utils";
  import {
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    Graph as GraphIcon,
    LinkSimple as LinkSimpleIcon,
    SortAscending as SortAscendingIcon,
    Stack as StackIcon,
    TreeStructure as TreeStructureIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { untrack, type Component } from "svelte";
  import { z } from "zod";
  import AlgorithmPage from "./algorithm-page.svelte";
  import { CATALOG, entry_for, Group, GROUP_NAMES, in_group } from "./catalog";
  import { clean_params, type Definition, type Params } from "./engine/definition";
  import { ALGO_EXTENSION, parse_algo_file, serialize_algo_file } from "./engine/file";
  import { resolve_input } from "./engine/resolve";
  import type { AlgorithmsProps } from "./props";
  import { definition_for } from "./registry";

  const props: AlgorithmsProps = $props();
  const { app_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));

  const GROUP_ICONS: Record<Group, Component> = {
    [Group.SORTING]: SortAscendingIcon,
    [Group.TREES]: TreeStructureIcon,
    [Group.GRAPHS]: GraphIcon,
    [Group.STRUCTURES]: StackIcon,
  };
  const GROUP_ITEMS = Object.values(Group).map((group) => ({ value: group, label: GROUP_NAMES[group], icon: GROUP_ICONS[group], count: in_group(group).length }));

  const section = storage.window<string>("section", untrack(() => props.section ?? CATALOG[0].id), z.string());
  const inputs = storage.window<Record<string, unknown>>("inputs", {}, z.record(z.string(), z.unknown()));
  const all_params = storage.window<Record<string, Params>>("params", {}, z.record(z.string(), z.record(z.string(), z.union([z.number(), z.string()]))));
  const folder = storage.persisted("folder", PATHS.documents, z.string());

  let path = $state<string | null>(untrack(() => props.path ?? null));
  let loaded = $state.raw<{ id: string; definition: Definition } | null>(null);
  let failed = $state<string | null>(null);

  const entry = $derived(entry_for(section.value) ?? CATALOG[0]);
  const group = $derived(entry.group);
  const algorithms = $derived(in_group(group));
  const definition = $derived(loaded?.id === entry.id ? loaded.definition : null);

  $effect(() => {
    const id = entry.id;
    let current = true;
    failed = null;
    definition_for(id)
      .then((found) => {
        if (!current) return;
        if (!found) failed = "This algorithm isn't here.";
        else loaded = { id, definition: found };
      })
      .catch((reason) => {
        if (current) failed = error_message(reason);
      });
    return () => {
      current = false;
    };
  });

  const input = $derived(definition ? resolve_input(definition, inputs.value[entry.id]).value : undefined);
  const params = $derived(definition ? clean_params(definition.params, all_params.value[entry.id]) : {});

  untrack(() => {
    if (props.input !== undefined) inputs.value = { ...inputs.value, [props.section ?? section.value]: props.input };
    if (props.params) all_params.value = { ...all_params.value, [props.section ?? section.value]: props.params };
    if (props.path) void open_path(props.path);
  });

  function change(next_input: unknown, next_params: Params) {
    inputs.value = { ...inputs.value, [entry.id]: $state.snapshot(next_input) };
    all_params.value = { ...all_params.value, [entry.id]: next_params };
  }

  function pick_group(next: Group) {
    if (next !== group) section.value = in_group(next)[0].id;
  }

  async function open_path(target: string) {
    try {
      const file = await files.get_file(target);
      const parsed = file ? parse_algo_file(await file.text()) : null;
      if (!parsed || !entry_for(parsed.algorithm)) throw new Error("This isn't an algorithm file Algorithms can read.");
      inputs.value = { ...inputs.value, [parsed.algorithm]: parsed.input };
      if (parsed.params) all_params.value = { ...all_params.value, [parsed.algorithm]: parsed.params };
      section.value = parsed.algorithm;
      path = target;
      folder.value = parent_path(target);
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't open the file", message: error_message(reason) });
    }
  }

  async function open() {
    const chosen = await win.pick_file({ accept: [ALGO_EXTENSION], start_path: path ? parent_path(path) : folder.value, title: "Open in Algorithms" });
    if (chosen) await open_path(chosen);
  }

  async function save() {
    if (!definition) return;
    let target = path && !is_system_path(path) ? path : null;
    if (!target) {
      const chosen = await win.pick_save({ name: `${entry.id}${ALGO_EXTENSION}`, accept: [ALGO_EXTENSION], start_path: folder.value, title: "Save the input" });
      if (!chosen) return;
      target = chosen.toLowerCase().endsWith(ALGO_EXTENSION) ? chosen : `${chosen}${ALGO_EXTENSION}`;
    }
    try {
      const directory = await files.get_directory(parent_path(target));
      if (!directory) throw new Error(`Folder not found: ${parent_path(target)}`);
      const content = serialize_algo_file({ version: 1, algorithm: entry.id, input: $state.snapshot(input), ...(Object.keys(params).length ? { params } : {}) });
      await files.create_file(directory, base_name(target), { content, overwrite: true });
      path = target;
      folder.value = parent_path(target);
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't save", message: error_message(reason) });
    }
  }

  async function share() {
    const link = route_url({
      kind: RouteKind.SOLO,
      id: app_id,
      props: { section: entry.id, input: $state.snapshot(input) as AlgorithmsProps["input"], ...(Object.keys(params).length ? { params } : {}) },
    });
    try {
      await clipboard.copy_text(link);
      notifications.notify(app_id, { type: NotificationType.INFO, title: "Link copied", message: `Opens ${entry.name} on its own, with this input.` });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't copy the link", message: error_message(reason) });
    }
  }

  $effect(() => win.set_title(path ? base_name(path) : entry.name));
</script>

<div class="flex h-full flex-col @2xl:flex-row">
  <SideNav label="Groups" items={GROUP_ITEMS} bind:value={() => group, pick_group} />
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <Toolbar class="flex-nowrap">
      <nav class="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="{GROUP_NAMES[group]} algorithms">
        {#each algorithms as item (item.id)}
          <button
            type="button"
            aria-current={item.id === entry.id ? "page" : undefined}
            class={cn(
              "h-7 shrink-0 rounded-md px-2.5 text-ui font-medium whitespace-nowrap transition-colors duration-150 pointer-coarse:h-9",
              item.id === entry.id ? "bg-primary/15 text-primary" : "text-foreground/80 hover:bg-foreground/6 hover:text-foreground"
            )}
            onclick={() => (section.value = item.id)}
          >
            {item.name}
          </button>
        {/each}
      </nav>
      <div class="flex shrink-0 items-center gap-0.5 border-l border-foreground/8 pl-1.5">
        <IconButton label="Open…" size="sm" onclick={open}><FolderOpenIcon weight="bold" /></IconButton>
        <IconButton label="Save" size="sm" disabled={!definition} onclick={save}><FloppyDiskIcon weight="bold" /></IconButton>
        <IconButton label="Copy a link to this input" size="sm" disabled={!definition} onclick={share}><LinkSimpleIcon weight="bold" /></IconButton>
      </div>
    </Toolbar>
    <div class="min-h-0 flex-1 overflow-y-auto @4xl:overflow-hidden">
      {#if failed}
        <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't load this algorithm" description={failed} />
      {:else if definition && input !== undefined}
        {#key entry.id}
          <AlgorithmPage {entry} {definition} {input} {params} onchange={change} />
        {/key}
      {:else}
        <div class="grid h-full place-items-center"><Spinner label="Loading" /></div>
      {/if}
    </div>
  </div>
</div>

<script lang="ts">
  import kernel, {
    renamed_saved,
    THEME_PRESETS,
    without_saved,
    type AppsService,
    type DialogsService,
    type FilesService,
    type NotificationsService,
    type SavedTheme,
    ThemeGroup,
    type SettingsService,
    type Theme,
    type ThemeToken,
  } from "$lib/core/api";
  import { PATHS } from "$lib/core/api/services/files/hierarchy";
  import { Button, IconButton, Section, SettingRow } from "$lib/core/components/ui";
  import { report_file_error } from "$lib/core/components/files/file-explorer.errors";
  import {
    CaretRight as CaretRightIcon,
    DotsThree as DotsThreeIcon,
    Export as ExportIcon,
    FolderOpen as FolderOpenIcon,
    PencilSimple as PencilSimpleIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { get_app_context } from "$lib/core/contexts/app";
  import { ask_theme_name } from "../theme-name";
  import ThemeCard from "$lib/core/components/theme/theme-card.svelte";
  import ThemeImport from "./theme-import.svelte";
  import { Subpage } from "../ids";
  import { serialize_theme_file, THEME_FILE_EXTENSION, theme_file_name } from "../theme-file";

  let { import_path = $bindable(null), onsub }: { import_path?: string | null; onsub: (sub: Subpage) => void } = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const files = $derived(kernel.service<FilesService>("files"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const { window: win } = get_app_context();

  const is_active = (theme: Theme) => Object.entries(theme).every(([token, value]) => settings.theme[token as ThemeToken] === value);
  const active_preset = $derived(THEME_PRESETS.find(({ theme }) => is_active(theme)));
  const active_saved = $derived(active_preset ? undefined : settings.saved_themes.find(({ theme }) => is_active(theme)));

  async function saved_menu(anchor: { x: number; y: number }, entry: SavedTheme) {
    const choice = await dialogs.menu(
      [
        { id: "apply", label: "Apply" },
        { id: "rename", label: "Rename…", icon: PencilSimpleIcon },
        { id: "export", label: "Export", icon: ExportIcon },
        { separator: true },
        { id: "delete", label: "Delete…", icon: TrashIcon, danger: true },
      ],
      { anchor }
    );
    if (choice === "apply") settings.theme = { ...entry.theme };
    else if (choice === "export") await export_theme(entry);
    else if (choice === "rename") {
      const name = await ask_theme_name(win, settings.saved_themes, { message: "Rename theme", confirm_label: "Rename", current: entry.name });
      if (name) settings.saved_themes = renamed_saved(settings.saved_themes, entry.name, name);
    } else if (choice === "delete") {
      if (await win.confirm(`Delete “${entry.name}”?`, { confirm_label: "Delete", danger: true })) {
        settings.saved_themes = without_saved(settings.saved_themes, entry.name);
      }
    }
  }

  function menu_below(event: MouseEvent, entry: SavedTheme) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    void saved_menu({ x: rect.left, y: rect.bottom + 4 }, entry);
  }

  async function export_theme(entry: SavedTheme) {
    try {
      const folder = await files.get_directory(PATHS.documents);
      if (!folder) throw new Error(`${PATHS.documents} doesn't exist`);
      const handle = await files.create_file(folder, theme_file_name(entry.name), { content: serialize_theme_file(entry) });
      notifications.notify("settings", {
        title: `Exported “${entry.name}”`,
        message: `${PATHS.documents}/${handle.name}`,
        actions: [{ label: "Show folder", on_click: () => apps.launch("file-explorer", { path: PATHS.documents }) }],
      });
    } catch (error) {
      report_file_error("Couldn't export the theme", error);
    }
  }

  async function pick_theme_file() {
    const chosen = await win.pick_file({ accept: [THEME_FILE_EXTENSION], start_path: PATHS.documents, title: "Import theme" });
    if (chosen) import_path = chosen;
  }

  const presets_in = (group: ThemeGroup) => THEME_PRESETS.filter((preset) => preset.group === group);
</script>

<div class="flex flex-col gap-8">
  {#if import_path}
    <ThemeImport path={import_path} onclose={() => (import_path = null)} />
  {/if}

  <Section
    setting="saved-themes"
    title="Your themes"
    description={settings.saved_themes.length > 0 ? "Saved from Create a theme or imported." : "Save one from Create a theme, or import a .webos-theme file."}
    flush
  >
    {#snippet actions()}
      <Button size="sm" variant="quiet" onclick={pick_theme_file}><FolderOpenIcon /> Import…</Button>
    {/snippet}
    {#if settings.saved_themes.length > 0}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
        {#each settings.saved_themes as entry (entry.name)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="relative grid"
            oncontextmenu={(event) => {
              event.preventDefault();
              void saved_menu({ x: event.clientX, y: event.clientY }, entry);
            }}
          >
            <ThemeCard preset={{ ...entry, group: ThemeGroup.WEBOS }} active={entry === active_saved} onselect={() => (settings.theme = { ...entry.theme })} />
            <IconButton
              size="sm"
              label="Options for {entry.name}"
              class="absolute top-2.5 right-2.5 size-7 bg-background-light/90 shadow-raised hover:bg-background-light pointer-coarse:size-9"
              onclick={(event) => menu_below(event, entry)}
            >
              <DotsThreeIcon weight="bold" />
            </IconButton>
          </div>
        {/each}
      </div>
    {/if}
  </Section>

  <Section
    setting="theme-presets"
    title="Themes"
    description={active_preset ? `${active_preset.name} is active.` : active_saved ? `${active_saved.name} is active.` : "A customised theme is active."}
    flush
  >
    <div class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
      {#each presets_in(ThemeGroup.WEBOS) as preset (preset.name)}
        <ThemeCard {preset} active={preset === active_preset} onselect={() => (settings.theme = { ...preset.theme })} />
      {/each}
    </div>
  </Section>

  <Section setting="project-themes" title="Project themes" description="Colours from other projects: Speed Reader and While True." flush>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
      {#each presets_in(ThemeGroup.PROJECTS) as preset (preset.name)}
        <ThemeCard {preset} active={preset === active_preset} onselect={() => (settings.theme = { ...preset.theme })} />
      {/each}
    </div>
  </Section>

  <Section title="Make your own" description="Your corners, shadows, text size and fonts stay as they are.">
    <SettingRow label="Create a theme" description="New colours from a few rules; save the ones you like.">
      {#snippet children({ id, describedby })}
        <Button {id} aria-describedby={describedby} onclick={() => onsub(Subpage.CREATE)}>Create <CaretRightIcon weight="bold" /></Button>
      {/snippet}
    </SettingRow>
    <SettingRow label="Edit colours" description="Every colour of the current theme, one by one.">
      {#snippet children({ id, describedby })}
        <Button {id} aria-describedby={describedby} onclick={() => onsub(Subpage.COLOURS)}>Edit <CaretRightIcon weight="bold" /></Button>
      {/snippet}
    </SettingRow>
  </Section>
</div>

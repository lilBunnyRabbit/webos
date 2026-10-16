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
  import { Button, Section } from "$lib/core/components/ui";
  import { report_file_error } from "$lib/core/components/files/file-explorer.errors";
  import {
    CaretRight as CaretRightIcon,
    Export as ExportIcon,
    FolderOpen as FolderOpenIcon,
    PencilSimple as PencilSimpleIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { get_app_context } from "$lib/core/contexts/app";
  import { ask_theme_name } from "../theme-name";
  import { to_hex, to_oklch } from "../color";
  import ThemeCard from "$lib/core/components/theme/theme-card.svelte";
  import WallpaperSection from "./wallpaper.svelte";
  import GenerateSection from "./generate.svelte";
  import InterfaceSection from "./interface.svelte";
  import ThemeImport from "./theme-import.svelte";
  import { serialize_theme_file, THEME_FILE_EXTENSION, theme_file_name } from "../theme-file";

  let { import_path = $bindable(null) }: { import_path?: string | null } = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const files = $derived(kernel.service<FilesService>("files"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const { window: win } = get_app_context();

  const active_preset = $derived(
    THEME_PRESETS.find(({ theme }) => Object.entries(theme).every(([token, value]) => settings.theme[token as ThemeToken] === value))
  );

  const is_active = (theme: Theme) => Object.entries(theme).every(([token, value]) => settings.theme[token as ThemeToken] === value);
  const active_saved = $derived(active_preset ? undefined : settings.saved_themes.find(({ theme }) => is_active(theme)));

  async function saved_menu(event: MouseEvent, entry: SavedTheme) {
    event.preventDefault();
    const choice = await dialogs.menu(
      [
        { id: "apply", label: "Apply" },
        { id: "rename", label: "Rename…", icon: PencilSimpleIcon },
        { id: "export", label: "Export", icon: ExportIcon },
        { separator: true },
        { id: "delete", label: "Delete…", icon: TrashIcon, danger: true },
      ],
      { anchor: { x: event.clientX, y: event.clientY } }
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

  const GROUPS: { title: string; tokens: ThemeToken[] }[] = [
    {
      title: "Surfaces",
      tokens: ["background_lightest", "background_lighter", "background_light", "background", "background_dark", "background_darker", "background_darkest"],
    },
    { title: "Text and brand", tokens: ["foreground", "primary", "secondary", "tertiary", "accent", "cottontail"] },
    { title: "States", tokens: ["success", "warning", "error", "info"] },
  ];

  // The customiser converts every token to hex for the colour inputs; only pay for it while it's open.
  let customising = $state(false);
  const hex = $derived.by(() => {
    if (!customising) return null;
    const tokens = GROUPS.flatMap((group) => group.tokens);
    const values = to_hex(tokens.map((token) => settings.theme[token]));
    return new Map(tokens.map((token, index) => [token, values[index]]));
  });

  function set_token(token: ThemeToken, value: string) {
    settings.theme = { ...settings.theme, [token]: value };
  }

  function label(token: ThemeToken): string {
    return token.replace("background_", "").replaceAll("_", " ");
  }
</script>

<div class="flex flex-col gap-8">
  {#if import_path}
    <ThemeImport path={import_path} onclose={() => (import_path = null)} />
  {/if}

  <Section
    title="Your themes"
    description={settings.saved_themes.length > 0
      ? "Saved from Generate or imported. Right-click one to rename, export or delete it."
      : "Save one from Generate, or import a .webos-theme file."}
    flush
  >
    {#snippet actions()}
      <Button size="sm" variant="quiet" onclick={pick_theme_file}><FolderOpenIcon /> Import…</Button>
    {/snippet}
    {#if settings.saved_themes.length > 0}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
        {#each settings.saved_themes as entry (entry.name)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="contents" oncontextmenu={(event) => saved_menu(event, entry)}>
            <ThemeCard preset={{ ...entry, group: ThemeGroup.WEBOS }} active={entry === active_saved} onselect={() => (settings.theme = { ...entry.theme })} />
          </div>
        {/each}
      </div>
    {/if}
  </Section>

  <Section title="Theme" description={active_preset ? `${active_preset.name} is active.` : active_saved ? `${active_saved.name} is active.` : "A customised theme is active."} flush>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
      {#each presets_in(ThemeGroup.WEBOS) as preset (preset.name)}
        <ThemeCard {preset} active={preset === active_preset} onselect={() => (settings.theme = { ...preset.theme })} />
      {/each}
    </div>
  </Section>

  <GenerateSection />

  <Section title="Project themes" description="Colours from other projects: Speed Reader and While True." flush>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
      {#each presets_in(ThemeGroup.PROJECTS) as preset (preset.name)}
        <ThemeCard {preset} active={preset === active_preset} onselect={() => (settings.theme = { ...preset.theme })} />
      {/each}
    </div>
  </Section>

  <details bind:open={customising} class="group rounded-xl bg-background-light ring-1 ring-foreground/8">
    <summary class="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 select-none hover:bg-foreground/4 [&::-webkit-details-marker]:hidden">
      <CaretRightIcon class="size-3.5 text-foreground/65 transition-transform duration-150 group-open:rotate-90" weight="bold" />
      <span class="text-ui font-medium">Customise colours</span>
      <span class="ml-auto text-2xs text-foreground/80">Values are OKLCH</span>
    </summary>

    {#if customising}
    <div class="flex flex-col gap-5 border-t border-foreground/8 px-4 pt-4 pb-5">
      {#each GROUPS as group (group.title)}
        <div class="flex flex-col gap-2">
          <h3 class="text-2xs font-medium tracking-wide text-foreground/80 uppercase">{group.title}</h3>
          <div class="grid grid-cols-1 gap-1.5 @xl:grid-cols-2">
            {#each group.tokens as token (token)}
              {@const value = settings.theme[token]}
              <div class="flex items-center gap-2 rounded-lg bg-background-darker p-1 pr-2 ring-1 ring-inset ring-foreground/8">
                <label class="relative size-7 pointer-coarse:size-9 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-inset ring-foreground/15" style:background={value} title="Pick {label(token)}">
                  <input
                    type="color"
                    class="absolute inset-0 cursor-pointer opacity-0"
                    value={hex?.get(token)}
                    onchange={(event) => set_token(token, to_oklch(event.currentTarget.value))}
                  />
                </label>
                <span class="w-20 shrink-0 text-ui capitalize">{label(token)}</span>
                <input
                  aria-label="{label(token)} value"
                  class="min-w-0 flex-1 bg-transparent font-mono text-2xs text-foreground/80 outline-none focus:text-foreground"
                  spellcheck="false"
                  {value}
                  onchange={(event) => set_token(token, event.currentTarget.value)}
                />
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    {/if}
  </details>

  <InterfaceSection />

  <WallpaperSection />
</div>

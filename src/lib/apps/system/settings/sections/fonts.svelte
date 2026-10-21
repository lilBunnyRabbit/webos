<script lang="ts">
  import kernel, {
    BUILTIN_FONTS,
    DEFAULT_FONT_NAMES,
    FONT_DIRECTORY,
    FONT_FILE_ACCEPT,
    FontRole,
    NotificationType,
    type FilesService,
    type FontChoice,
    type NotificationsService,
    type SettingsService,
  } from "$lib/core/api";
  import { PATHS } from "$lib/core/api/services/files/hierarchy";
  import { IconButton, Section, Select, SettingRow } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message } from "$lib/core/utils";
  import { FolderOpen as FolderOpenIcon, Trash as TrashIcon } from "phosphor-svelte";

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const { window: win } = get_app_context();

  const ROLES = [
    { role: FontRole.SANS, setting: "ui-font", label: "UI font", description: "Everything you read: windows, menus, the desktop.", sample: "The quick brown fox jumps over the lazy dog" },
    { role: FontRole.MONO, setting: "code-font", label: "Code font", description: "Code, the terminal, hex values and sizes.", sample: "const hop = (x) => x * 2; // 0O 1lI" },
  ] as const;

  let installed = $state<string[]>([]);

  $effect(() => {
    void files.revision(FONT_DIRECTORY);
    void files.revision(PATHS.etc);
    void settings.appearance.font.sans;
    void settings.appearance.font.mono;
    let stale = false;
    settings.installed_fonts().then((names) => !stale && (installed = names));
    return () => (stale = true);
  });

  const encode = (choice: FontChoice) => (choice.kind === "default" ? "default" : choice.kind === "builtin" ? `builtin:${choice.id}` : `file:${choice.name}`);

  function decode(value: string): FontChoice {
    if (value.startsWith("builtin:")) return { kind: "builtin", id: value.slice(8) };
    if (value.startsWith("file:")) return { kind: "file", name: value.slice(5) };
    return { kind: "default" };
  }

  const stem = (name: string) => name.replace(/\.[^.]+$/, "");

  function options_for(role: FontRole) {
    const current = settings.appearance.font[role];
    const names = current.kind === "file" && !installed.includes(current.name) ? [...installed, current.name] : installed;
    return [
      { value: "default", label: `${DEFAULT_FONT_NAMES[role]} (default)` },
      ...Object.entries(BUILTIN_FONTS).map(([id, font]) => ({ value: `builtin:${id}`, label: font.name })),
      ...names.map((name) => ({ value: `file:${name}`, label: name })),
    ];
  }

  function choose(role: FontRole, value: string) {
    settings.appearance.font = { ...settings.appearance.font, [role]: decode(value) };
  }

  function report(title: string, reason: unknown) {
    notifications.notify("settings", { type: NotificationType.ERROR, title, message: error_message(reason) });
  }

  async function add(role: FontRole) {
    const chosen = await win.pick_file({ accept: FONT_FILE_ACCEPT, start_path: PATHS.home, title: role === FontRole.SANS ? "Choose a UI font" : "Choose a code font" });
    if (!chosen) return;
    try {
      await settings.use_font(role, chosen);
    } catch (reason) {
      report("Couldn't use that font", reason);
    }
  }

  async function remove(name: string) {
    const ok = await win.confirm(`Remove ${stem(name)}?`, { detail: "Anything using it goes back to the default font.", confirm_label: "Remove", danger: true });
    if (!ok) return;
    try {
      await settings.remove_font(name);
    } catch (reason) {
      report(`Couldn't remove ${stem(name)}`, reason);
    }
  }
</script>

<Section title="Fonts" description="Kept when you switch themes. Use one from Font Maker or Font Viewer, or pick a font file here.">
  {#each ROLES as item (item.role)}
    <div>
      <SettingRow setting={item.setting} label={item.label} description={item.description}>
        {#snippet children({ id, describedby })}
          <Select
            {id}
            aria-describedby={describedby}
            class="w-44"
            options={options_for(item.role)}
            value={encode(settings.appearance.font[item.role])}
            onchange={(event) => choose(item.role, event.currentTarget.value)}
          />
          <IconButton label="Choose a font file…" onclick={() => add(item.role)}><FolderOpenIcon /></IconButton>
        {/snippet}
      </SettingRow>
      <p class="px-4 pb-3 text-base break-words" style:font-family="var(--font-{item.role})">
        {item.sample} · <span class="font-bold">Bold</span> · <span class="italic">Italic</span>
      </p>
    </div>
  {/each}

  {#if installed.length}
    <p class="px-4 pt-3 pb-1 text-2xs font-medium tracking-wide text-foreground/80 uppercase">Installed in {FONT_DIRECTORY}</p>
    {#each installed as name (name)}
      <SettingRow label={stem(name)} description={name.split(".").pop()?.toUpperCase()}>
        {#snippet children({ id, describedby })}
          <IconButton {id} aria-describedby={describedby} label="Remove {stem(name)}" size="sm" onclick={() => remove(name)}><TrashIcon /></IconButton>
        {/snippet}
      </SettingRow>
    {/each}
  {/if}
</Section>

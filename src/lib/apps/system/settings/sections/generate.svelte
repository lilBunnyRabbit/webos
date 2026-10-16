<script lang="ts">
  import { untrack } from "svelte";
  import kernel, {
    derive_theme,
    generate_theme,
    Harmony,
    is_dark,
    ThemeGroup,
    type SettingsService,
    type ThemeBase,
    type ThemeMode,
    type DialogsService,
    with_saved,
  } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { ask_theme_name } from "../theme-name";
  import { Button, IconButton, Section, Segmented, Select, SettingRow, Slider } from "$lib/core/components/ui";
  import ThemeCard from "$lib/core/components/theme/theme-card.svelte";
  import { FloppyDisk as FloppyDiskIcon, LockSimple as LockIcon, LockSimpleOpen as LockOpenIcon, MagicWand as MagicWandIcon } from "phosphor-svelte";
  import { cn } from "$lib/core/utils";
  import { generator, remember } from "../generator.svelte";

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const { window: win } = get_app_context();

  const TOKENS: { token: keyof ThemeBase; label: string }[] = [
    { token: "background", label: "Background" },
    { token: "foreground", label: "Text" },
    { token: "primary", label: "Primary" },
    { token: "secondary", label: "Secondary" },
    { token: "accent", label: "Accent" },
  ];
  const MODES: { value: ThemeMode; label: string }[] = [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
    { value: "any", label: "Any" },
  ];
  const HARMONIES: { value: Harmony | "any"; label: string }[] = [
    { value: "any", label: "Any harmony" },
    { value: Harmony.ANALOGOUS, label: "Analogous" },
    { value: Harmony.COMPLEMENTARY, label: "Complementary" },
    { value: Harmony.TRIADIC, label: "Triadic" },
    { value: Harmony.SPLIT, label: "Split complementary" },
  ];

  const current = (): ThemeBase => {
    const { background, foreground, primary, secondary, accent } = settings.theme;
    return { background, foreground, primary, secondary, accent };
  };

  // Starts from the applied theme, then stays the panel's own.
  let mode = $state<ThemeMode>(untrack(() => (is_dark(settings.theme) ? "dark" : "light")));
  let harmony = $state<Harmony | "any">("any");
  let vibrance = $state(50);
  let contrast = $state(50);
  let locked = $state<Partial<Record<keyof ThemeBase, boolean>>>({});
  let preview = $state<ThemeBase>(untrack(current));

  const applied = $derived(TOKENS.every(({ token }) => settings.theme[token] === preview[token]));
  const preview_preset = $derived({ name: applied ? "Applied" : "Preview", theme: derive_theme(preview), group: ThemeGroup.WEBOS });

  function generate() {
    const keep = Object.fromEntries(TOKENS.filter(({ token }) => locked[token]).map(({ token }) => [token, preview[token]]));
    preview = generate_theme({ mode, harmony, vibrance: vibrance / 100, contrast: contrast / 100, locked: keep });
    remember(preview);
  }

  const apply = () => (settings.theme = derive_theme(preview));

  async function save(base: ThemeBase) {
    const name = await ask_theme_name(win, settings.saved_themes, { message: "Save theme", confirm_label: "Save" });
    if (name) settings.saved_themes = with_saved(settings.saved_themes, name, derive_theme(base));
  }

  async function recent_menu(event: MouseEvent, base: ThemeBase) {
    event.preventDefault();
    const choice = await dialogs.menu(
      [
        { id: "apply", label: "Apply" },
        { id: "save", label: "Save…", icon: FloppyDiskIcon },
      ],
      { anchor: { x: event.clientX, y: event.clientY } }
    );
    if (choice === "apply") settings.theme = derive_theme(base);
    else if (choice === "save") void save(base);
  }
</script>

<Section title="Generate" description="New colours from a few rules. Text always stays readable; lock a colour to keep it, save the ones you like." flush>
  <div class="@container flex flex-col gap-4">
    <div class="grid gap-4 @xl:grid-cols-[minmax(0,1fr)_13rem]">
      <div class="flex flex-col gap-1 rounded-xl bg-background-light ring-1 ring-foreground/8">
        <SettingRow label="Mode">
          {#snippet children({ id, describedby })}
            <Segmented {id} aria-describedby={describedby} label="Mode" size="sm" options={MODES} bind:value={mode} />
          {/snippet}
        </SettingRow>
        <SettingRow label="Harmony" description="How the three colours relate around the colour wheel.">
          {#snippet children({ id, describedby })}
            <Select {id} aria-describedby={describedby} size="sm" options={HARMONIES} bind:value={harmony} />
          {/snippet}
        </SettingRow>
        <SettingRow label="Vibrance" description="Muted to vivid.">
          {#snippet children({ id, describedby })}
            <Slider {id} aria-describedby={describedby} class="w-40" min={0} max={100} bind:value={vibrance} />
          {/snippet}
        </SettingRow>
        <SettingRow label="Contrast" description="Soft to strong, never below readable.">
          {#snippet children({ id, describedby })}
            <Slider {id} aria-describedby={describedby} class="w-40" min={0} max={100} bind:value={contrast} />
          {/snippet}
        </SettingRow>
      </div>

      <div class="flex flex-col gap-2">
        <ThemeCard preset={preview_preset} active={applied} onselect={apply} />
        <div class="grid grid-cols-2 gap-2">
          <Button class="col-span-2" onclick={generate}><MagicWandIcon weight="bold" /> Generate</Button>
          <Button variant="secondary" disabled={applied} onclick={apply}>Apply</Button>
          <Button variant="secondary" onclick={() => void save(preview)}><FloppyDiskIcon weight="bold" /> Save…</Button>
        </div>
      </div>
    </div>

    <ul class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2" aria-label="Colours">
      {#each TOKENS as { token, label } (token)}
        <li class="flex items-center gap-2 rounded-xl bg-background-light p-1.5 pr-1 ring-1 ring-foreground/8">
          <span class="size-7 shrink-0 rounded-lg ring-1 ring-foreground/12" style:background={preview[token]}></span>
          <span class="min-w-0 flex-1 truncate text-ui">{label}</span>
          <IconButton
            size="sm"
            label={locked[token] ? `Unlock ${label.toLowerCase()}` : `Lock ${label.toLowerCase()}`}
            pressed={locked[token] ?? false}
            class={cn(locked[token] && "text-primary")}
            onclick={() => (locked = { ...locked, [token]: !locked[token] })}
          >
            {#if locked[token]}<LockIcon weight="fill" />{:else}<LockOpenIcon weight="bold" />{/if}
          </IconButton>
        </li>
      {/each}
    </ul>

    {#if generator.recent.length > 0}
      <div class="flex flex-col gap-2">
        <h3 class="px-0.5 text-ui font-medium text-foreground/80">Recent</h3>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
          {#each generator.recent as base, index (index)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="contents" oncontextmenu={(event) => recent_menu(event, base)}>
              <ThemeCard
                preset={{ name: `#${index + 1}`, theme: derive_theme(base), group: ThemeGroup.WEBOS }}
                active={TOKENS.every(({ token }) => preview[token] === base[token])}
                onselect={() => (preview = base)}
              />
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</Section>

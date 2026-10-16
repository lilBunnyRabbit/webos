<script lang="ts">
  import kernel, { derive_theme, is_dark, random_theme, THEME_PRESETS, ThemeGroup, type SettingsService, type ThemeToken } from "$lib/core/api";
  import { Button, Section } from "$lib/core/components/ui";
  import { CaretRight as CaretRightIcon, Shuffle as ShuffleIcon } from "phosphor-svelte";
  import { to_hex, to_oklch } from "../color";
  import ThemeCard from "$lib/core/components/theme/theme-card.svelte";
  import WallpaperSection from "./wallpaper.svelte";

  const settings = $derived(kernel.service<SettingsService>("settings"));

  const active_preset = $derived(
    THEME_PRESETS.find(({ theme }) => Object.entries(theme).every(([token, value]) => settings.theme[token as ThemeToken] === value))
  );

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
  <Section title="Theme" description={active_preset ? `${active_preset.name} is active.` : "A customised theme is active."} flush>
    {#snippet actions()}
      <Button size="sm" title="A new theme that keeps light or dark and picks colours that go together" onclick={() => (settings.theme = derive_theme(random_theme(is_dark(settings.theme))))}>
        <ShuffleIcon weight="bold" /> Shuffle
      </Button>
    {/snippet}
    <div class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
      {#each presets_in(ThemeGroup.WEBOS) as preset (preset.name)}
        <ThemeCard {preset} active={preset === active_preset} onselect={() => (settings.theme = { ...preset.theme })} />
      {/each}
    </div>
  </Section>

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

  <WallpaperSection />
</div>

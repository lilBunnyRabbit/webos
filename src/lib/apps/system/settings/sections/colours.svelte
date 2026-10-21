<script lang="ts">
  import kernel, { type SettingsService, type ThemeToken } from "$lib/core/api";
  import { Input, Section, SettingRow } from "$lib/core/components/ui";
  import { to_hex, to_oklch } from "../color";

  const settings = $derived(kernel.service<SettingsService>("settings"));

  const GROUPS: { title: string; description: string; tokens: ThemeToken[] }[] = [
    {
      title: "Surfaces",
      description: "The seven background shades, lightest first.",
      tokens: ["background_lightest", "background_lighter", "background_light", "background", "background_dark", "background_darker", "background_darkest"],
    },
    { title: "Text and brand", description: "Text, the brand colours and the focus ring.", tokens: ["foreground", "primary", "secondary", "tertiary", "accent", "cottontail"] },
    { title: "States", description: "Success, warnings, errors and info.", tokens: ["success", "warning", "error", "info"] },
  ];

  const hex = $derived.by(() => {
    const tokens = GROUPS.flatMap((group) => group.tokens);
    const values = to_hex(tokens.map((token) => settings.theme[token]));
    return new Map(tokens.map((token, index) => [token, values[index]]));
  });

  function set_token(token: ThemeToken, value: string) {
    settings.theme = { ...settings.theme, [token]: value };
  }

  const label = (token: ThemeToken) => {
    const words = token.replace("background_", "background ").replaceAll("_", " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  };
</script>

<div data-setting="theme-colours" class="flex flex-col gap-8">
  <p class="text-ui text-foreground/65">Changes apply as you make them. Values are OKLCH; picking a colour replaces a derived value with a fixed one.</p>

  {#each GROUPS as group (group.title)}
    <Section title={group.title} description={group.description}>
      {#each group.tokens as token (token)}
        {@const value = settings.theme[token]}
        <SettingRow label={label(token)}>
          {#snippet children({ id, describedby })}
            <label
              class="relative size-8 pointer-coarse:size-10 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/15 ring-inset"
              style:background={value}
              title="Pick {label(token).toLowerCase()}"
            >
              <input
                type="color"
                aria-label="Pick {label(token).toLowerCase()}"
                class="absolute inset-0 cursor-pointer opacity-0"
                value={hex.get(token)}
                onchange={(event) => set_token(token, to_oklch(event.currentTarget.value))}
              />
            </label>
            <Input
              {id}
              aria-describedby={describedby}
              class="w-52 font-mono text-2xs"
              spellcheck="false"
              autocomplete="off"
              {value}
              onchange={(event) => set_token(token, event.currentTarget.value)}
            />
          {/snippet}
        </SettingRow>
      {/each}
    </Section>
  {/each}
</div>

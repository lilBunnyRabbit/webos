<script lang="ts">
  import kernel, { AppearanceMotion, AppearanceRadius, AppearanceShadow, AppearanceText, type SettingsService } from "$lib/core/api";
  import { Section, Segmented, SettingRow } from "$lib/core/components/ui";

  const settings = $derived(kernel.service<SettingsService>("settings"));

  const RADII = [
    { value: AppearanceRadius.SHARP, label: "Sharp" },
    { value: AppearanceRadius.DEFAULT, label: "Default" },
    { value: AppearanceRadius.ROUND, label: "Round" },
  ];

  const SHADOWS = [
    { value: AppearanceShadow.NONE, label: "None" },
    { value: AppearanceShadow.SUBTLE, label: "Subtle" },
    { value: AppearanceShadow.DEFAULT, label: "Default" },
    { value: AppearanceShadow.STRONG, label: "Strong" },
  ];

  const TEXT_SIZES = [
    { value: AppearanceText.S, label: "Small" },
    { value: AppearanceText.M, label: "Medium" },
    { value: AppearanceText.L, label: "Large" },
  ];

  const MOTIONS = [
    { value: AppearanceMotion.SYSTEM, label: "System" },
    { value: AppearanceMotion.OFF, label: "Off" },
  ];
</script>

<Section title="Interface" description="Kept when you switch themes.">
  <SettingRow label="Corners" description="How round windows, menus and buttons are.">
    {#snippet children({ id, describedby })}
      <Segmented {id} aria-describedby={describedby} label="Corners" bind:value={settings.appearance.radius} options={RADII} />
    {/snippet}
  </SettingRow>
  <SettingRow label="Shadows" description="How strongly windows, menus and tiles lift off what's behind them.">
    {#snippet children({ id, describedby })}
      <Segmented {id} aria-describedby={describedby} label="Shadows" bind:value={settings.appearance.shadow} options={SHADOWS} />
    {/snippet}
  </SettingRow>
  <SettingRow label="Text size" description="Scales text and the spacing around it.">
    {#snippet children({ id, describedby })}
      <Segmented {id} aria-describedby={describedby} label="Text size" bind:value={settings.appearance.text} options={TEXT_SIZES} />
    {/snippet}
  </SettingRow>
  <SettingRow label="Motion" description="Off stops animations. System follows your device's reduce motion setting.">
    {#snippet children({ id, describedby })}
      <Segmented {id} aria-describedby={describedby} label="Motion" bind:value={settings.appearance.motion} options={MOTIONS} />
    {/snippet}
  </SettingRow>
</Section>

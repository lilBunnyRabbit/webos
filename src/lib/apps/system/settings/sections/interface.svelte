<script lang="ts">
  import kernel, { AppearanceMotion, AppearanceRadius, type SettingsService } from "$lib/core/api";
  import { Section, Segmented, SettingRow } from "$lib/core/components/ui";

  const settings = $derived(kernel.service<SettingsService>("settings"));

  const RADII = [
    { value: AppearanceRadius.SHARP, label: "Sharp" },
    { value: AppearanceRadius.DEFAULT, label: "Default" },
    { value: AppearanceRadius.ROUND, label: "Round" },
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
  <SettingRow label="Motion" description="Off stops animations. System follows your device's reduce motion setting.">
    {#snippet children({ id, describedby })}
      <Segmented {id} aria-describedby={describedby} label="Motion" bind:value={settings.appearance.motion} options={MOTIONS} />
    {/snippet}
  </SettingRow>
</Section>

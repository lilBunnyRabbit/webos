<script lang="ts">
  import kernel, { BRAND_DARK, TaskbarPosition, WallpaperPreset, type SettingsService, type VersionService } from "$lib/core/api";
  import LogoLockup from "$lib/core/components/brand/logo-lockup.svelte";
  import { Badge, Button, Section, SettingRow } from "$lib/core/components/ui";
  import { format_datetime } from "$lib/core/utils";
  import { installer } from "$lib/core/utils/install.svelte";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowSquareOut as ArrowSquareOutIcon,
    CheckCircle as CheckCircleIcon,
    DownloadSimple as DownloadSimpleIcon,
    Play as PlayIcon,
    Sparkle as SparkleIcon,
  } from "phosphor-svelte";

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const version = $derived(kernel.service<VersionService>("version"));

  const DEV = import.meta.env.DEV;
  const INSTALL_WHY = "Its own window, works offline, and the browser is far less likely to clear its storage.";

  const rows = $derived([
    ["Version", version.info.version],
    ["Commit", version.info.commit],
    ["Branch", version.info.branch],
    ["Built", format_datetime(new Date(version.info.buildTime))],
  ]);

  function reset_settings() {
    settings.taskbar.position = TaskbarPosition.BOTTOM;
    settings.theme = { ...BRAND_DARK };
    settings.file_defaults = {};
    settings.wallpaper = { kind: "preset", preset: WallpaperPreset.GRID };
  }
</script>

<div class="flex flex-col gap-8">
  <div class="flex flex-col items-start gap-3 rounded-xl bg-background-light p-5 ring-1 ring-foreground/8">
    <LogoLockup height={40} />
    <div>
      <h2 class="text-base font-semibold">WebOS</h2>
      <p class="text-ui text-foreground/65">A desktop that lives in your browser. Runs offline, keeps your files on this device.</p>
    </div>
    <div class="flex gap-1.5">
      <Badge tone={DEV ? "warning" : "primary"}>{DEV ? "Development" : "Production"}</Badge>
      <Badge>v{version.info.version}</Badge>
    </div>
  </div>

  <Section title="Install">
    <SettingRow
      label="Install WebOS"
      description={installer.installed || installer.can_install ? INSTALL_WHY : `${INSTALL_WHY} ${installer.hint}`}
    >
      {#if installer.installed}
        <span class="flex items-center gap-1.5 text-ui font-medium text-success">
          <CheckCircleIcon class="size-4" weight="fill" /> Installed
        </span>
      {:else if installer.can_install}
        <Button variant="primary" onclick={() => installer.install()}>
          <DownloadSimpleIcon /> Install
        </Button>
      {/if}
    </SettingRow>
  </Section>

  <Section title="Build">
    {#each rows as [label, value] (label)}
      <div class="flex items-center justify-between gap-4 px-4 py-2.5">
        <span class="text-ui text-foreground/80">{label}</span>
        <span class="truncate font-mono text-2xs">{value}</span>
      </div>
    {/each}
  </Section>

  <Section title="Updates" description={DEV ? "Update checks are off in development builds." : "WebOS also checks every 30 minutes on its own."}>
    <SettingRow
      label={version.update_available ? `v${version.update_available.version} is ready` : "You're on the latest build"}
      description={version.update_available ? `Commit ${version.update_available.commit}. Reloads into the new build.` : undefined}
    >
      {#if version.update_available}
        <Button variant="primary" onclick={() => version.apply_update()}>
          <SparkleIcon weight="fill" /> Update and reload
        </Button>
      {:else}
        {#if !version.is_checking && !DEV}<CheckCircleIcon class="size-4 text-success" weight="fill" />{/if}
        <Button disabled={DEV || version.is_checking} onclick={() => version.check()}>
          <ArrowClockwiseIcon class={version.is_checking ? "animate-spin" : ""} />
          {version.is_checking ? "Checking" : "Check now"}
        </Button>
      {/if}
    </SettingRow>
  </Section>

  <Section title="Introduction">
    <SettingRow label="Show the introduction" description="The full-screen tour from your first visit: installing, files, getting around, theme and taskbar.">
      <Button onclick={() => version.show_intro()}>
        <PlayIcon /> Show again
      </Button>
    </SettingRow>
  </Section>

  <Section title="Reset">
    <SettingRow label="Reset settings" description="Brand Dark theme, grid wallpaper, taskbar at the bottom, default apps forgotten. Files are kept.">
      <Button variant="danger" onclick={reset_settings}>
        <ArrowCounterClockwiseIcon /> Reset
      </Button>
    </SettingRow>
  </Section>

  <a
    href="https://github.com/lilbunnyrabbit/webos"
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-center gap-1.5 self-start text-ui text-primary hover:underline"
  >
    Source on GitHub <ArrowSquareOutIcon class="size-3.5" />
  </a>
</div>

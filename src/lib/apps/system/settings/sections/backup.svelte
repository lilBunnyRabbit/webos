<script lang="ts">
  import kernel, {
    BACKUP_AREAS,
    BackupError,
    BRAND_DARK,
    DEFAULT_APPEARANCE,
    TaskbarPosition,
    TaskbarSize,
    WallpaperPreset,
    type BackupArea,
    type BackupService,
    type NotificationsService,
    type SettingsService,
  } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, Section, SettingRow, Spinner, Switch } from "$lib/core/components/ui";
  import { format_bytes } from "$lib/core/utils";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, DownloadSimple as DownloadSimpleIcon, Eraser as EraserIcon } from "phosphor-svelte";

  const backup = $derived(kernel.service<BackupService>("backup"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const { window: win } = get_app_context();

  let chosen = $state<Record<BackupArea, boolean>>({ files: true, settings: true, apps: true });
  let sizes = $state<Record<BackupArea, number> | null>(null);

  const areas = $derived(BACKUP_AREAS.filter(({ area }) => chosen[area]).map(({ area }) => area));
  const total = $derived(sizes ? areas.reduce((sum, area) => sum + sizes![area], 0) : null);

  $effect(() => {
    let cancelled = false;
    backup.sizes().then(
      (result) => {
        if (!cancelled) sizes = result;
      },
      (error) => console.error("[Settings] Couldn't measure backup areas:", error)
    );
    return () => {
      cancelled = true;
    };
  });

  async function reset_settings() {
    const ok = await win.confirm("Reset settings?", {
      detail: "Theme, wallpaper, text and interface, taskbar and default apps go back to how WebOS started. Saved themes, fonts and files are kept.",
      confirm_label: "Reset",
      danger: true,
    });
    if (!ok) return;
    settings.taskbar = { position: TaskbarPosition.BOTTOM, pinned: [], size: TaskbarSize.MEDIUM, auto_hide: false, seconds: false };
    settings.theme = { ...BRAND_DARK };
    settings.file_defaults = {};
    settings.wallpaper = { kind: "preset", preset: WallpaperPreset.GRID };
    settings.appearance = { ...DEFAULT_APPEARANCE };
    settings.live_options = {};
  }

  async function report(title: string, run: () => Promise<unknown>) {
    try {
      await run();
    } catch (error) {
      if (!(error instanceof BackupError)) console.error(`[Settings] ${title}:`, error);
      notifications.notify("settings", { type: "error", title, message: error instanceof Error ? error.message : String(error) });
    }
  }
</script>

<div class="flex flex-col gap-8">
  <Section setting="backup-create" title="Back up" description="One zip of what you pick, saved to this device. Clearing site data can't touch it.">
    {#each BACKUP_AREAS as { area, label, path } (area)}
      <SettingRow {label} description="{path}{area === 'apps' ? ' and app storage' : ''} · {sizes ? format_bytes(sizes[area]) : '…'}">
        {#snippet children({ id, describedby })}
          <Switch {id} aria-describedby={describedby} bind:checked={chosen[area]} disabled={backup.activity !== null} />
        {/snippet}
      </SettingRow>
    {/each}
    <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <span class="text-ui text-foreground/65">
        {#if backup.last}
          Last: <span class="font-mono">{backup.last.name}</span> · {format_bytes(backup.last.size)}
        {:else if total !== null}
          About {format_bytes(total)} before compression
        {/if}
      </span>
      <Button variant="primary" disabled={areas.length === 0 || backup.activity !== null} onclick={() => report("Couldn't save the backup", () => backup.create(areas))}>
        {#if backup.activity === "creating"}<Spinner label="Working" class="text-current" />{:else}<DownloadSimpleIcon weight="bold" />{/if}
        Download backup
      </Button>
    </div>
  </Section>

  <Section title="Restore" description="Replaces each area the backup holds and leaves the others alone. WebOS reloads afterwards.">
    <SettingRow setting="backup-restore" label="Restore from a backup" description="Pick a webos-backup zip on this device. You'll be asked before anything is replaced.">
      {#snippet children({ id, describedby })}
        <Button {id} aria-describedby={describedby} disabled={backup.activity !== null} onclick={() => report("Couldn't restore the backup", () => backup.restore())}>
          {#if backup.activity === "restoring"}<Spinner label="Working" class="text-current" />{:else}<ArrowCounterClockwiseIcon weight="bold" />{/if}
          Restore…
        </Button>
      {/snippet}
    </SettingRow>
  </Section>

  <Section title="Reset">
    <SettingRow
      setting="reset-settings"
      label="Reset settings"
      description="Brand Dark theme, default corners, text size and motion, grid wallpaper, taskbar at the bottom with nothing pinned, default apps forgotten. Saved themes, fonts and files are kept."
    >
      {#snippet children({ id, describedby })}
        <Button {id} aria-describedby={describedby} variant="danger" onclick={reset_settings}><EraserIcon /> Reset…</Button>
      {/snippet}
    </SettingRow>
  </Section>
</div>

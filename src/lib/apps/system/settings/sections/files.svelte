<script lang="ts">
  import kernel, { type AppsService, type SettingsService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Section, SettingRow } from "$lib/core/components/ui";
  import { FileDashed as FileDashedIcon, X as XIcon } from "phosphor-svelte";

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const defaults = $derived(Object.entries(settings.file_defaults).sort(([a], [b]) => a.localeCompare(b)));

  function forget(extension: string) {
    const { [extension]: _removed, ...rest } = settings.file_defaults;
    settings.file_defaults = rest;
  }
</script>

<Section setting="default-apps" title="Remembered choices" description="Added when you tick “Always use” in the Open with menu.">
  {#snippet actions()}
    {#if defaults.length > 0}
      <Button size="sm" variant="quiet" onclick={() => (settings.file_defaults = {})}>Forget all</Button>
    {/if}
  {/snippet}

  {#if defaults.length === 0}
    <EmptyState icon={FileDashedIcon} title="No default apps yet" description="Files with more than one app ask you each time." class="py-8" />
  {:else}
    {#each defaults as [extension, app_id] (extension)}
      {@const manifest = apps.get(app_id)}
      <SettingRow label={extension} description={manifest ? `Opens in ${manifest.name}` : `${app_id} is no longer installed`}>
        {#snippet children({ id, describedby })}
          {#if manifest}<manifest.icon class="size-4 shrink-0 text-foreground/80" weight="duotone" />{/if}
          <IconButton {id} aria-describedby={describedby} label="Forget {extension}" size="sm" onclick={() => forget(extension)}>
            <XIcon weight="bold" />
          </IconButton>
        {/snippet}
      </SettingRow>
    {/each}
  {/if}
</Section>

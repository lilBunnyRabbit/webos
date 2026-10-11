<script lang="ts">
  import kernel, { type AppsService, type SettingsService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Section } from "$lib/core/components/ui";
  import { FileDashed as FileDashedIcon, X as XIcon } from "phosphor-svelte";

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const defaults = $derived(Object.entries(settings.file_defaults).sort(([a], [b]) => a.localeCompare(b)));

  function forget(extension: string) {
    const { [extension]: _removed, ...rest } = settings.file_defaults;
    settings.file_defaults = rest;
  }
</script>

<Section title="Remembered choices" description="Added when you tick “Always use” in the Open with menu.">
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
      <div class="flex items-center gap-3 px-4 py-2.5">
        <span class="w-20 shrink-0 font-mono text-ui">{extension}</span>
        <span class="flex min-w-0 flex-1 items-center gap-2 text-ui">
          {#if manifest}
            <manifest.icon class="size-4 shrink-0 text-foreground/80" weight="duotone" />
            <span class="truncate">{manifest.name}</span>
          {:else}
            <span class="text-error">{app_id} (no longer installed)</span>
          {/if}
        </span>
        <IconButton label="Forget {extension}" size="sm" onclick={() => forget(extension)}>
          <XIcon weight="bold" />
        </IconButton>
      </div>
    {/each}
  {/if}
</Section>

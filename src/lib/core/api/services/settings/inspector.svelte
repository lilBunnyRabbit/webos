<script lang="ts">
  import kernel, { THEME_PRESETS, type AppsService, type InspectorProps, type SettingsService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<SettingsService> = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));

  const preset = $derived(
    THEME_PRESETS.find(({ theme }) => Object.entries(theme).every(([token, value]) => service.theme[token as keyof typeof theme] === value))
  );
  const defaults = $derived(Object.entries(service.file_defaults));
</script>

<InspectorStats>
  <InspectorStat label="Theme" value={preset?.name ?? "Custom"} />
  <InspectorStat label="Taskbar" value={`${service.taskbar.position} · ${service.taskbar.size}${service.taskbar.auto_hide ? " · auto-hide" : ""}`} />
  <InspectorStat label="File defaults" value={defaults.length} />
</InspectorStats>

{#if detailed}
  <div class="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
    {#each Object.entries(service.theme) as [token, value] (token)}
      <div class="flex items-center gap-2 rounded-sm border border-foreground/15 p-1.5">
        <span class="size-6 shrink-0 rounded-sm border border-foreground/20" style:background={value}></span>
        <div class="min-w-0">
          <div class="text-ui">{token}</div>
          <div class="truncate font-mono text-2xs text-foreground/80" title={value}>{value}</div>
        </div>
      </div>
    {/each}
  </div>

  <InspectorTable columns={["Extension", "Opens with"]} empty={defaults.length === 0} empty_text="No remembered file defaults.">
    {#each defaults as [extension, app_id] (extension)}
      <tr>
        <td>{extension}</td>
        <td class="font-sans">{apps.get(app_id)?.name ?? `${app_id} (missing)`}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}

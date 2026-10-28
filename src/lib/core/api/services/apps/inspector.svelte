<script lang="ts">
  import type { AppsService, InspectorProps } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";
  import { RECENT_PATH } from "./recent";
  import { FAVOURITES_PATH } from "./favourites";

  let { service, detailed }: InspectorProps<AppsService> = $props();

  const manifests = $derived([...service.list()].map(([, manifest]) => manifest));
  const system_count = $derived(manifests.filter((manifest) => manifest.system).length);
  const association_count = $derived(manifests.reduce((total, manifest) => total + (manifest.associations?.length ?? 0), 0));
</script>

<InspectorStats>
  <InspectorStat label="Known" value={manifests.length} />
  <InspectorStat label="Installed slice" value={service.installed_catalogue()?.apps.length ?? "not ready"} />
  <InspectorStat label="System / user" value="{system_count} / {manifests.length - system_count}" />
  <InspectorStat label="Associations" value={association_count} />
  <InspectorStat label="Recent" value={service.recent.length} />
  <InspectorStat label="Favourites" value={service.favourites.length} />
</InspectorStats>

{#if detailed}
  <InspectorStats>
    <InspectorStat label="Recent, newest first" value={service.recent.join(" ") || "—"} />
    <InspectorStat label="Recent file" value={RECENT_PATH} />
    <InspectorStat label="Favourites, in order" value={service.favourites.join(" ") || "—"} />
    <InspectorStat label="Favourites file" value={FAVOURITES_PATH} />
  </InspectorStats>

  <InspectorTable columns={["", "Id", "Name", "Version", "Props", "Opens"]} empty={manifests.length === 0}>
    {#each manifests as manifest (manifest.id)}
      <tr>
        <td><manifest.icon class="size-4" /></td>
        <td>{manifest.id}</td>
        <td class="font-sans">{manifest.name}</td>
        <td>{manifest.version}</td>
        <td>{manifest.props ? "schema" : "—"}</td>
        <td class="max-w-64 truncate" title={manifest.associations?.join(" ")}>{manifest.associations?.join(" ") || "—"}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}

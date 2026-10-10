<script lang="ts">
  import type { InspectorProps, SessionService } from "$lib/core/api";
  import { InspectorStat, InspectorStats } from "$lib/core/components/inspector";
  import { SESSION_PATH } from "./persistence";

  let { service, detailed }: InspectorProps<SessionService> = $props();
</script>

<InspectorStats>
  <InspectorStat label="Status" value={service.status} />
  <InspectorStat label="Saved windows" value={service.saved_count} />
  <InspectorStat label="Last saved" value={service.last_saved?.toLocaleTimeString() ?? "—"} />
</InspectorStats>

{#if detailed}
  <InspectorStats>
    <InspectorStat label="File" value={SESSION_PATH} />
  </InspectorStats>
{/if}

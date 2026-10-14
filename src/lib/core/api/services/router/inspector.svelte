<script lang="ts">
  import type { InspectorProps, RouterService } from "$lib/core/api";
  import { InspectorStat, InspectorStats } from "$lib/core/components/inspector";

  let { service }: InspectorProps<RouterService> = $props();
</script>

<InspectorStats>
  <InspectorStat label="Last link" value={service.last_link?.hash ?? "—"} />
  <InspectorStat label="Outcome" value={service.last_link?.outcome ?? "—"} />
</InspectorStats>

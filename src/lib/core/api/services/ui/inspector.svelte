<script lang="ts">
  import type { InspectorProps, UiService } from "$lib/core/api";
  import { InspectorStat, InspectorStats } from "$lib/core/components/inspector";

  let { service }: InspectorProps<UiService> = $props();
</script>

<InspectorStats>
  <InspectorStat label="Open" value={service.overlay ?? "nothing"} />
  <InspectorStat label="Back guard" value={service.armed ? "armed" : "not armed"} />
</InspectorStats>

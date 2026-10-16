<script lang="ts">
  import kernel, { type ExtractService, type InspectorProps, type WindowsService } from "$lib/core/api";
  import { InspectorStat, InspectorStats } from "$lib/core/components/inspector";

  let { service }: InspectorProps<ExtractService> = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const instance = $derived(service.current ? windows.get(service.current) : null);
</script>

<InspectorStats>
  <InspectorStat label="Picture-in-Picture" value={service.supported ? "supported" : "not supported"} />
  <InspectorStat label="Out" value={instance ? (instance.title ?? instance.app.manifest.name) : "nothing"} />
</InspectorStats>

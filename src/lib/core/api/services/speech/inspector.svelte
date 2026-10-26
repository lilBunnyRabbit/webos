<script lang="ts">
  import type { InspectorProps } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";
  import type { SpeechService } from "./type";

  let { service, detailed }: InspectorProps<SpeechService> = $props();
</script>

<InspectorStats>
  <InspectorStat label="Voices" value={service.supported ? service.voices.length : "not supported"} />
  <InspectorStat label="Speaking" value={service.speaking ?? "—"} />
  <InspectorStat label="Queued" value={service.queued} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Voice", "Language", "Where"]} empty={service.voices.length === 0} empty_text="No voices listed yet.">
    {#each service.voices as voice (voice.voiceURI)}
      <tr><td>{voice.name}{voice.default ? " (default)" : ""}</td><td>{voice.lang}</td><td>{voice.localService ? "device" : "online"}</td></tr>
    {/each}
  </InspectorTable>
{/if}

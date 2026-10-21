<script lang="ts">
  import { AiFeature } from "$lib/core/api";
  import { AiGate } from "$kit/components/ai-gate";
  import { Scribble as ScribbleIcon } from "phosphor-svelte";
  import DoodleGame from "./doodle-game.svelte";
</script>

<AiGate
  features={[AiFeature.PROMPT_IMAGE]}
  icon={ScribbleIcon}
  title="Doodlehop isn't available on this device"
  download="The first guess downloads Chrome's AI model once, a few GB. It runs on this device after that, offline too."
>
  {#snippet children({ notice })}
    <DoodleGame {notice} />
  {/snippet}
</AiGate>

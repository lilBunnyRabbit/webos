<script lang="ts">
  import { WarningCircle as WarningCircleIcon } from "phosphor-svelte";
  import type { Gw2Error } from "./api";

  let { error }: { error: Gw2Error } = $props();
</script>

<p role="alert" class="flex items-start gap-2 rounded-lg bg-error/10 px-3 py-2 text-ui text-error">
  <WarningCircleIcon class="mt-0.5 size-4 shrink-0" />
  <span>{error.message} Showing what loaded before.</span>
</p>

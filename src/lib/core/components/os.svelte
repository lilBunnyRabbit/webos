<script lang="ts">
  import type { Component } from "svelte";
  import UpdateOverlay from "./update/update-overlay.svelte";

  // The current platform's shell (ADR-016), loaded by main.ts during boot so it renders with the first paint (ADR-036).
  // Each shell renders its own DialogsHost.
  let { shell: Shell }: { shell: Component } = $props();
</script>

<Shell />

<UpdateOverlay />

<script lang="ts">
  import kernel, { Platform } from "$lib/core/api";
  import DesktopShell from "./desktop-shell.svelte";
  import MobileShell from "./mobile/mobile-shell.svelte";
  import UpdateOverlay from "./update/update-overlay.svelte";
</script>

<!-- The one platform branch (ADR-016): everything below types against its own platform's services. Each shell renders
     its own DialogsHost. -->
{#if kernel.platform === Platform.MOBILE}
  <MobileShell />
{:else}
  <DesktopShell />
{/if}

<UpdateOverlay />

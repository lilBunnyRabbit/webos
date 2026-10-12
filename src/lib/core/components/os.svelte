<script lang="ts">
  import kernel, { Platform } from "$lib/core/api";
  import DesktopShell from "./desktop-shell.svelte";
  import MobileShell from "./mobile/mobile-shell.svelte";
  import DialogsHost from "./dialogs/dialogs-host.svelte";
</script>

<!-- The one platform branch (ADR-016): everything below types against its own platform's services. -->
{#if kernel.platform === Platform.MOBILE}
  <MobileShell />
{:else}
  <DesktopShell />
{/if}

<DialogsHost />

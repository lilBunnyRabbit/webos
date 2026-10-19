<script lang="ts">
  import { CopyButton, IconButton } from "$lib/core/components/ui";
  import { qr_path } from "$kit/utils/qr";
  import { ShareNetwork as ShareNetworkIcon } from "phosphor-svelte";

  let { code, label }: { code: string; label: string } = $props();

  const qr = $derived(qr_path(code));

  function share() {
    navigator.share({ text: code }).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) console.warn("[ShoppingList] share failed", reason);
    });
  }
</script>

<figure class="flex flex-col items-center gap-1">
  <div class="aspect-square w-full max-w-64 overflow-hidden rounded-lg ring-1 ring-foreground/8">
    <!-- Scanners expect dark modules on a light field, so the colours flip with the theme's colour scheme. -->
    <svg viewBox="0 0 {qr.size} {qr.size}" role="img" aria-label={label} shape-rendering="crispEdges" class="size-full bg-[light-dark(var(--background),var(--foreground))]">
      <path d={qr.d} class="fill-[light-dark(var(--foreground),var(--background-darkest))]" />
    </svg>
  </div>
  <figcaption class="flex items-center gap-1">
    <CopyButton text={code} label="Copy code" />
    {#if "share" in navigator}
      <IconButton label="Share code" size="sm" onclick={share}><ShareNetworkIcon weight="bold" /></IconButton>
    {/if}
  </figcaption>
</figure>

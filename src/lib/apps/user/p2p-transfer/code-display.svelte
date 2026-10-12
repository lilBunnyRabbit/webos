<script lang="ts">
  import { CopyButton, IconButton } from "$lib/core/components/ui";
  import { ShareNetwork as ShareNetworkIcon } from "phosphor-svelte";
  import { qr_path } from "$lib/core/utils/qr";
  import Viewfinder from "./viewfinder.svelte";

  let { code, label, kind }: { code: string; label: string; kind: string } = $props();

  const qr = $derived(qr_path(code));

  /** Hands the code to a messaging app or nearby share; faster than copy, switch apps, paste. */
  function share() {
    navigator.share({ text: code }).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) console.warn("[P2PTransfer] share failed", reason);
    });
  }
  // Size without the 4-module quiet zone on each side: 21 modules at version 1, +4 per version.
  const version = $derived((qr.size - 8 - 17) / 4);
</script>

<figure class="flex flex-col items-center gap-2">
  <Viewfinder>
    <!-- Scanners expect dark modules on a light field, so the colours flip with the theme's colour scheme. -->
    <svg viewBox="0 0 {qr.size} {qr.size}" role="img" aria-label={label} shape-rendering="crispEdges" class="size-full bg-[light-dark(var(--background),var(--foreground))]">
      <path d={qr.d} class="fill-[light-dark(var(--foreground),var(--background-darkest))]" />
    </svg>
  </Viewfinder>
  <figcaption class="flex flex-wrap items-center justify-center gap-x-1.5 font-mono text-2xs whitespace-nowrap text-foreground/80 uppercase tabular-nums">
    <span class="text-primary">{kind}</span>
    <span>· {code.length} B</span>
    <span>· QR v{version}</span>
    <span>· ECC L</span>
    <span class="flex">
      <CopyButton text={code} />
      <IconButton label="Share code" size="sm" onclick={share}><ShareNetworkIcon weight="bold" /></IconButton>
    </span>
  </figcaption>
</figure>

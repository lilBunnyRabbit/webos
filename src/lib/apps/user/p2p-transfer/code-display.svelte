<script lang="ts">
  import { CopyButton } from "$lib/core/components/ui";
  import { qr_path } from "$lib/core/utils/qr";
  import Viewfinder from "./viewfinder.svelte";

  let { code, label, kind }: { code: string; label: string; kind: string } = $props();

  const qr = $derived(qr_path(code));
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
  <figcaption class="flex items-center gap-1.5 font-mono text-2xs text-foreground/80 uppercase tabular-nums">
    <span class="text-primary">{kind}</span>
    <span aria-hidden="true">·</span>{code.length} B
    <span aria-hidden="true">·</span>QR v{version}
    <span aria-hidden="true">·</span>ECC L
    <CopyButton text={code} />
  </figcaption>
</figure>

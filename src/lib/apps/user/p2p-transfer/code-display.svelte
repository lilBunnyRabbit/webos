<script lang="ts">
  import { CopyButton } from "$lib/core/components/ui";
  import { qr_path } from "$lib/core/utils/qr";

  let { code, label }: { code: string; label: string } = $props();

  const qr = $derived(qr_path(code));
</script>

<figure class="flex flex-col items-center gap-2">
  <!-- Scanners expect dark modules on a light field, so the colours flip with the theme's colour scheme. -->
  <svg
    viewBox="0 0 {qr.size} {qr.size}"
    role="img"
    aria-label={label}
    shape-rendering="crispEdges"
    class="aspect-square w-full max-w-64 rounded-lg bg-[light-dark(var(--background),var(--foreground))]"
  >
    <path d={qr.d} class="fill-[light-dark(var(--foreground),var(--background-darkest))]" />
  </svg>
  <figcaption class="flex items-center gap-1 text-ui text-foreground/65">
    No camera? Copy the code instead <CopyButton text={code} />
  </figcaption>
</figure>

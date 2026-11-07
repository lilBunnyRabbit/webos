<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <path d="M2.5 20.5h19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.55" />
  <path d="M4 13.2l2.2-.2 1.8-2.6h1.2l-.6 2.4 5.6-.6 3-3.2h1.6l-1.4 3.4 2.8.4c.9.1.9 1.3 0 1.4l-14.4 1.4c-1.2.1-1.8-1.3-1.8-2.4Z" fill="var(--primary)" />
  <path d="M9.6 13l1.6-4.4h1.4L12.4 12.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
</svg>

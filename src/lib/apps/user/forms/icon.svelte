<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="2.75" width="4.5" height="4.5" rx="1.25"/>
    <rect x="2.75" y="9.75" width="4.5" height="4.5" rx="1.25"/>
    <rect x="2.75" y="16.75" width="4.5" height="4.5" rx="1.25"/>
    <path d="M10.5 5h10.75M10.5 12h8M10.5 19h9.5"/>
  </g>
  <path d="M3.75 4.9l1.15 1.1 1.85-2.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="2"/>
    <path d="M10.5 2.75v18.5M10.5 11.5h10.75"/>
    <path d="M6.6 18v-4M6.6 15.25c-1.75 0-2.6-1-2.6-2.5 1.6 0 2.6.9 2.6 2.5zM6.6 14c0-1.5.9-2.5 2.5-2.5 0 1.5-.85 2.5-2.5 2.5z"/>
  </g>
  <rect x="13.5" y="14.25" width="5" height="4.25" rx="0.75" fill="var(--primary)"/>
</svg>

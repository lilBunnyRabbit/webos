<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M13.75 5.75l4.5 4.5-4.5 4.5c-1.25 1.25-3.75 1.5-5 1.5 0-1.25.25-3.75 1.5-5z"/>
    <path d="M16 8l5.25-5.25"/>
  </g>
  <path d="M3 21.25c1.5 0 2-1.5 3.5-1.5s2 1.5 3.5 1.5 2-1.5 3.5-1.5" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

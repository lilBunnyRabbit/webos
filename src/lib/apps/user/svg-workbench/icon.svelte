<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 6L2.25 12 6 18M18 6l3.75 6L18 18"/>
    <path d="M10 15.5c3.5 0 .5-7 4-7"/>
    <rect x="7.5" y="14" width="3" height="3" rx="0.75"/>
    <rect x="13.5" y="7" width="3" height="3" rx="0.75"/>
  </g>
</svg>

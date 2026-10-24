<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.75 8V5a2.25 2.25 0 0 1 2.25-2.25h3M16 2.75h3A2.25 2.25 0 0 1 21.25 5v3M21.25 16v3A2.25 2.25 0 0 1 19 21.25h-3M8 21.25H5A2.25 2.25 0 0 1 2.75 19v-3"/>
    <rect x="8" y="8" width="8" height="8" rx="1.75"/>
  </g>
  <rect x="10.5" y="10.5" width="3" height="3" rx=".5" fill="currentColor"/>
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="2"/>
    <path d="M8.92 2.75v18.5M15.08 2.75v18.5M2.75 8.92h18.5M2.75 15.08h18.5"/>
  </g>
  <rect x="10.5" y="10.5" width="3" height="3" rx=".75" fill="currentColor"/>
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.5 3.75v16.5M8 4.25h9"/>
    <rect x="8" y="8.25" width="13.25" height="12.5" rx="2"/>
    <path d="M8 18.25l3.5-3.5 6 6"/>
  </g>
</svg>

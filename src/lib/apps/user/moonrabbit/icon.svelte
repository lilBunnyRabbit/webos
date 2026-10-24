<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4.75" y="2.75" width="14.5" height="18.5" rx="2"/>
    <path d="M8.25 2.75v18.5"/>
    <path d="M15.6 7.6A3.75 3.75 0 1 0 15.6 14.4A3.4 3.4 0 0 1 15.6 7.6z"/>
  </g>
</svg>

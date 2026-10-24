<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5.75 7.5l-3.5 4.5 3.5 4.5M18.25 7.5l3.5 4.5-3.5 4.5"/>
    <rect x="8.25" y="4.25" width="7.5" height="15.5" rx="2"/>
  </g>
</svg>

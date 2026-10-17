<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="2.75" width="7.5" height="7.5" rx="1.75"/>
    <rect x="13.75" y="2.75" width="7.5" height="7.5" rx="1.75"/>
    <rect x="2.75" y="13.75" width="7.5" height="7.5" rx="1.75"/>
  </g>
  <g fill="currentColor">
    <rect x="5.25" y="5.25" width="2.5" height="2.5" rx=".5"/>
    <rect x="16.25" y="5.25" width="2.5" height="2.5" rx=".5"/>
    <rect x="5.25" y="16.25" width="2.5" height="2.5" rx=".5"/>
    <rect x="15" y="15" width="5" height="5" rx="1"/>
  </g>
</svg>

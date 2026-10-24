<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="8.75" width="18.5" height="6.5" rx="3.25"/>
  </g>
  <g fill="currentColor">
    <circle cx="6" cy="4.5" r="1.25"/>
    <circle cx="12" cy="4.5" r="1.25"/>
    <circle cx="18" cy="4.5" r="1.25"/>
    <circle cx="6" cy="12" r="1.25"/>
    <circle cx="12" cy="12" r="1.25"/>
    <circle cx="18" cy="12" r="1.25"/>
    <circle cx="6" cy="19.5" r="1.25"/>
    <circle cx="12" cy="19.5" r="1.25"/>
    <circle cx="18" cy="19.5" r="1.25"/>
  </g>
</svg>

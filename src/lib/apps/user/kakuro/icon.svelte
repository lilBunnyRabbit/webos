<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="2.75" width="4.75" height="4.75" rx="1.25"/>
    <path d="M3.6 3.6l3.05 3.05"/>
    <rect x="9.625" y="2.75" width="4.75" height="4.75" rx="1.25"/>
    <rect x="16.5" y="2.75" width="4.75" height="4.75" rx="1.25"/>
    <rect x="2.75" y="9.625" width="4.75" height="4.75" rx="1.25"/>
    <rect x="2.75" y="16.5" width="4.75" height="4.75" rx="1.25"/>
  </g>
</svg>

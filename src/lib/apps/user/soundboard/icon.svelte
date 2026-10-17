<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="5.75" width="4.5" height="4.5" rx="1.25"/>
    <rect x="9.75" y="5.75" width="4.5" height="4.5" rx="1.25"/>
    <rect x="16.75" y="5.75" width="4.5" height="4.5" rx="1.25"/>
    <rect x="2.75" y="13.75" width="4.5" height="4.5" rx="1.25"/>
    <rect x="16.75" y="13.75" width="4.5" height="4.5" rx="1.25"/>
  </g>
  <rect x="9.5" y="12.75" width="5" height="6.5" rx="1.5" fill="var(--primary)"/>
</svg>

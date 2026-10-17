<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="6.25" width="4.5" height="4.5" rx="1.25"/>
    <rect x="9.5" y="6.25" width="4.5" height="4.5" rx="1.25"/>
    <path d="M2.75 17.75h4.5M9.5 17.75h4.5M16.25 17.75h5.5"/>
  </g>
  <rect x="16.25" y="5.75" width="5.5" height="5.5" rx="1.25" fill="var(--primary)"/>
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="var(--primary)">
    <rect x="2.5" y="9" width="3.5" height="12" rx="1" fill-opacity=".25"/>
    <rect x="7.5" y="9" width="3.5" height="12" rx="1" fill-opacity=".75"/>
    <rect x="12.5" y="9" width="3.5" height="12" rx="1" fill-opacity=".5"/>
    <rect x="17.5" y="9" width="3.5" height="12" rx="1"/>
  </g>
  <path d="M9.25 6.5V4.75a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1V6.5M12.75 5.25l1.5 1.25 1.25-1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 3.25h10.5a1.75 1.75 0 0 1 1.75 1.75v2.5a1.75 1.75 0 0 1-1.75 1.75H10.25v5.5a1.75 1.75 0 0 1-1.75 1.75H5a1.75 1.75 0 0 1-1.75-1.75V5A1.75 1.75 0 0 1 5 3.25z"/>
    <path d="M13.5 14.25c1.25-1.25 2.5-1.25 3.75 0s2.5 1.25 3.75 0M3.25 20c1.15-1.15 2.35-1.15 3.5 0s2.35 1.15 3.5 0 2.35 1.15 3.5 0 2.35 1.15 3.5 0 2.35 1.15 3.5 0"/>
  </g>
  <circle cx="6.75" cy="6.25" r="1.25" fill="currentColor"/>
</svg>

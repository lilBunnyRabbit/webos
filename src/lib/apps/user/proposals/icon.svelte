<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.25 2.75H6.75a2 2 0 0 0-2 2v14.5a2 2 0 0 0 2 2h10.5a2 2 0 0 0 2-2V7.75z"/>
    <path d="M14.25 2.75v5h5M8 7.25h3.5M8 18h8"/>
    <rect x="8" y="10.75" width="8" height="4.5" rx="1"/>
    <path d="M8.75 14.75l2.25-2 1.75 1.5 1.25-1 1.25 1.25"/>
  </g>
</svg>

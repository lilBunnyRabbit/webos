<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="3.25" width="4.5" height="6.75" rx="1"/>
    <rect x="2.75" y="13.5" width="4.5" height="6.75" rx="1"/>
    <path d="M10.25 4.75a2 2 0 0 1 2-2h4.5l4.5 4.5v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z"/>
    <path d="M16.75 2.75v4.5h4.5"/>
  </g>
</svg>

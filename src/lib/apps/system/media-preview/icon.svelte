<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="2.75" width="18.5" height="12.5" rx="2"/>
    <path d="M2.75 12.5l5.25-5 7.75 7.75"/>
    <path d="M2.75 20h4.5M10.75 20h10.5"/>
    <circle cx="9" cy="20" r="1.75"/>
  </g>
</svg>

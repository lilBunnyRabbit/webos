<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.75 4.5h3.5M10.25 4.5h3.5M17.75 4.5h3.5M2.75 9.5h3.5M17.75 9.5h3.5M2.75 14.5h3.5M10.25 14.5h3.5M17.75 14.5h3.5M2.75 19.5h3.5M10.25 19.5h3.5"/>
  </g>
  <rect x="9.25" y="7.75" width="5.5" height="3.5" rx="1.25" fill="currentColor"/>
</svg>

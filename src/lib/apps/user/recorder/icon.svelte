<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="7.5" cy="12" r="4.75"/>
    <path d="M15.5 8.5v7M18.5 5v14M21.25 10v4"/>
  </g>
  <circle cx="7.5" cy="12" r="2.25" fill="currentColor"/>
</svg>

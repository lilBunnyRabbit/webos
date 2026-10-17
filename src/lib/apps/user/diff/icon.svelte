<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="2.75" width="8" height="13.5" rx="2"/>
    <rect x="13.25" y="7.75" width="8" height="13.5" rx="2"/>
    <path d="M4.75 9.5h4M15.25 14.5h4M17.25 12.5v4"/>
  </g>
</svg>

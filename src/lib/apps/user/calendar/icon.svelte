<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="4.75" width="18.5" height="16.5" rx="2"/>
    <path d="M2.75 10h18.5M8 2.75v4M16 2.75v4"/>
  </g>
  <rect x="6.25" y="13.5" width="11.5" height="3.5" rx="1.75" fill="currentColor"/>
</svg>

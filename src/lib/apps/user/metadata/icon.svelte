<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/>
    <path d="M2.75 16.75l4.25-4.25 7.75 7.75"/>
    <path d="M16 15c-2.1-2.1-3-3.6-3-5a3 3 0 0 1 6 0c0 1.4-.9 2.9-3 5z"/>
  </g>
</svg>

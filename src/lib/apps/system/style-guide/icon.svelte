<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="2.75" width="11.5" height="6" rx="3"/>
    <path d="M2.75 13h18.5"/>
    <rect x="2.75" y="16.75" width="18.5" height="4.5" rx="1.75"/>
  </g>
  <circle cx="11.25" cy="5.75" r="1.75" fill="currentColor"/>
</svg>

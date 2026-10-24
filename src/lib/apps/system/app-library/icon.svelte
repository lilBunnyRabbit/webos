<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.75 21.25h18.5"/>
    <rect x="4" y="7.75" width="4" height="13.5" rx="1.25"/>
    <rect x="9.5" y="10.75" width="4" height="10.5" rx="1.25"/>
    <rect x="14.75" y="8.75" width="4" height="12.5" rx="1.25" transform="rotate(14 18.75 21.25)"/>
  </g>
</svg>

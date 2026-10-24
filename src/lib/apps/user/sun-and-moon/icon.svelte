<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="7.5" cy="7.5" r="2.5"/>
    <path d="M7.5 1.75v1.5M7.5 11.75v1.5M1.75 7.5h1.5M11.75 7.5h1.5M3.43 3.43l1.06 1.06M11.57 3.43l-1.06 1.06M3.43 11.57l1.06-1.06"/>
    <path d="M21.25 16a5.5 5.5 0 1 1-6-5.5 4.25 4.25 0 0 0 6 5.5z"/>
  </g>
</svg>

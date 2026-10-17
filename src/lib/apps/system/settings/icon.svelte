<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.75 5.5h10M19.25 5.5h2M2.75 12h2M11.25 12h10M2.75 18.5h6M15.25 18.5h6"/>
    <circle cx="16" cy="5.5" r="2.5"/>
    <circle cx="8" cy="12" r="2.5"/>
    <circle cx="12" cy="18.5" r="2.5"/>
  </g>
</svg>

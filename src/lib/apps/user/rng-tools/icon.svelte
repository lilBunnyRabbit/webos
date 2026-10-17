<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g transform="rotate(-12 12 12)">
    <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="3.25"/>
    </g>
    <g fill="currentColor">
      <circle cx="8" cy="8" r="1.5"/>
      <circle cx="16" cy="8" r="1.5"/>
      <circle cx="12" cy="12" r="1.5"/>
      <circle cx="8" cy="16" r="1.5"/>
      <circle cx="16" cy="16" r="1.5"/>
    </g>
  </g>
</svg>

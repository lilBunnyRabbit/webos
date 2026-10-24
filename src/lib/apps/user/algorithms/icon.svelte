<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="13.75" width="4" height="7.5" rx="1.25"/>
    <rect x="8.75" y="8.75" width="4" height="12.5" rx="1.25"/>
    <rect x="14.75" y="11.75" width="4" height="9.5" rx="1.25"/>
  </g>
  <circle cx="19.25" cy="5" r="2.25" fill="var(--primary)"/>
</svg>

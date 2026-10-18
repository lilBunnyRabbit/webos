<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="5" width="18.5" height="14" rx="2"/>
    <path d="M12 2.75v18.5"/>
    <path d="M2.75 16.25l3.25-3.25 3.25 3.25"/>
  </g>
  <rect x="14.5" y="8.25" width="4.25" height="4.25" rx="1" fill="var(--primary)"/>
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3.25" y="3.25" width="7.5" height="7.5" rx="2"/>
    <rect x="13.25" y="3.25" width="7.5" height="7.5" rx="2"/>
    <rect x="3.25" y="13.25" width="7.5" height="7.5" rx="2"/>
  </g>
  <rect x="13.25" y="13.25" width="7.5" height="7.5" rx="2" fill="var(--primary)"/>
</svg>

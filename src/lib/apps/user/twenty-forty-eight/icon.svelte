<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="3.25" width="6" height="6" rx="1.5"/>
    <rect x="2.75" y="14.75" width="6" height="6" rx="1.5"/>
  </g>
  <rect x="13.5" y="8.5" width="7" height="7" rx="1.75" fill="var(--primary)"/>
</svg>

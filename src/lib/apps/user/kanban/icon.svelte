<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="2.75" width="4.5" height="7" rx="1.25"/>
    <rect x="2.75" y="12.25" width="4.5" height="5" rx="1.25"/>
    <rect x="9.75" y="2.75" width="4.5" height="5" rx="1.25"/>
    <rect x="16.75" y="2.75" width="4.5" height="8" rx="1.25"/>
  </g>
  <rect x="10.25" y="14.5" width="5" height="6" rx="1.25" transform="rotate(-10 12.75 17.5)" fill="var(--primary)"/>
</svg>

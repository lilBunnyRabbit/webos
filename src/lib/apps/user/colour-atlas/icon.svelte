<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="13" r="8.25"/>
    <ellipse cx="11" cy="13" rx="3.5" ry="8.25"/>
    <path d="M2.75 13h16.5"/>
  </g>
  <circle cx="19" cy="5" r="3" fill="var(--primary)"/>
</svg>

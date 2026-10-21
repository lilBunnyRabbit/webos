<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.75 20.25c1.5-3 3-8.5 5.25-8.5 2.5 0 .5 6.5 3 6.5s2.5-5.5 5-5.5c1.75 0 2.25 3 5.25 3.25"/>
  </g>
  <circle cx="11.5" cy="5.5" r="2.75" fill="var(--primary)"/>
</svg>

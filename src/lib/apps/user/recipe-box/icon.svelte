<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 14.25a3.75 3.75 0 0 1-.4-7.45 5.5 5.5 0 0 1 10.8 0 3.75 3.75 0 0 1-.4 7.45"/>
    <rect x="7" y="14.25" width="10" height="6.75" rx="1.75"/>
  </g>
</svg>

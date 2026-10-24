<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="14" cy="13.5" r="7.25"/>
    <path d="M14 9.75v3.75l2.5 1.5"/>
    <path d="M2.75 6.25h5.5M6 4l2.25 2.25L6 8.5"/>
  </g>
</svg>

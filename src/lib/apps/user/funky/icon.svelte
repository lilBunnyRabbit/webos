<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6.25 3.25c-1.75 0-2.5.75-2.5 2.5v3c0 1.5-.5 2.25-1.5 3.25 1 1 1.5 1.75 1.5 3.25v3c0 1.75.75 2.5 2.5 2.5M17.75 3.25c1.75 0 2.5.75 2.5 2.5v3c0 1.5.5 2.25 1.5 3.25-1 1-1.5 1.75-1.5 3.25v3c0 1.75-.75 2.5-2.5 2.5"/>
    <g transform="rotate(45 12 12)">
      <path d="M12 6.75v10.5M7.5 12.5l4.5-2 4.5 2M10 16.75l2-.75 2 .75"/>
    </g>
  </g>
</svg>

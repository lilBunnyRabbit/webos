<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2"/>
    <path d="M7 9.25v5.5M10 9.25v5.5M12.5 9.25v5.5M17 9.25v5.5"/>
  </g>
</svg>

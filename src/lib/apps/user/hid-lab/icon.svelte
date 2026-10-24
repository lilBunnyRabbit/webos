<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3.75" y="9.25" width="16.5" height="12" rx="2.5"/>
    <rect x="6.5" y="10.75" width="11" height="7" rx="1.5"/>
    <path d="M12 2.25v4.75M9.75 4.75L12 7l2.25-2.25"/>
  </g>
</svg>

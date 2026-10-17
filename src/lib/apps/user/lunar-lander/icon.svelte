<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.25 3.25h5.5l2.25 3.25v4h-10v-4z"/>
    <path d="M8.5 10.5L5.5 16M15.5 10.5l3 5.5M3.75 16h3.5M16.75 16h3.5M7 21.25h10"/>
  </g>
  <path d="M12 19c-1.75-1.5-2.5-2.7-2.5-3.7a2.5 2.5 0 0 1 5 0c0 1-.75 2.2-2.5 3.7z" fill="var(--primary)"/>
</svg>

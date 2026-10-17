<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="4.75" width="18.5" height="14.5" rx="2"/>
    <path d="M12 12c-1.25-1.6-2.1-2.5-3.4-2.5a2.5 2.5 0 0 0 0 5c1.3 0 2.15-.9 3.4-2.5s2.1-2.5 3.4-2.5a2.5 2.5 0 0 1 0 5c-1.3 0-2.15-.9-3.4-2.5z"/>
  </g>
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="2.75" width="10.5" height="14" rx="2"/>
    <path d="M5.75 7h4.5M5.75 10.75h4.5M15.75 10.5a2.75 2.75 0 1 1 3.9 2.5c-.75.35-1.15.95-1.15 1.75v.75"/>
  </g>
  <circle cx="18.5" cy="20" r="1.1" fill="currentColor"/>
</svg>

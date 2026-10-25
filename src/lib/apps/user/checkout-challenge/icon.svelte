<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3.75" y="10.75" width="16.5" height="10.5" rx="2"/>
    <path d="M7 10.75V6.75h7.5v4M7 14.25h1.5M11.25 14.25h1.5M7 17.5h1.5M11.25 17.5h1.5"/>
  </g>
  <circle cx="18.25" cy="5" r="2" fill="var(--primary)"/>
</svg>

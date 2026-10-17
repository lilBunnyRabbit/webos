<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="4.75" width="5" height="14.5" rx="1.75"/>
    <rect x="17" y="4.75" width="5" height="14.5" rx="1.75"/>
  </g>
  <path d="M10 9.5h2.75l1.25 1.25v3.75h-4z" fill="var(--primary)" stroke="var(--primary)" stroke-width="1" stroke-linejoin="round"/>
</svg>

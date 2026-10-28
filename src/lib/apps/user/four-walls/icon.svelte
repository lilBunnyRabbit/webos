<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3.6 3.6 20.4 20.4M20.4 3.6 3.6 20.4"/>
  </g>
  <rect x="10.5" y="16.75" width="3" height="1.75" rx="0.5" fill="var(--primary)"/>
</svg>

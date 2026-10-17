<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.75 4h4v6h-4M2.75 14h4v6h-4M6.75 7h4v10h-4"/>
  </g>
  <path d="M16 7.5h4v3a2 2 0 0 1-4 0zM17.5 12.5h1v2.75h-1zM16 15.25h4v1.75h-4z" fill="var(--primary)" stroke="var(--primary)" stroke-width="1" stroke-linejoin="round"/>
  <path d="M15.75 8.5h-.5a1 1 0 0 0 0 2h.5M20.25 8.5h.5a1 1 0 0 1 0 2h-.5" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

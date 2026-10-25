<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M3 14.5h18M3 19.5h18"/>
  </g>
  <circle cx="9" cy="14.5" r="2" fill="currentColor"/>
  <circle cx="16" cy="19.5" r="2" fill="currentColor"/>
  <rect x="3" y="2.75" width="18" height="7.5" rx="2" fill="var(--primary)"/>
</svg>

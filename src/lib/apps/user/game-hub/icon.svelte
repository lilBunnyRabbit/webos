<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3.25h10M4.75 6.25h14.5"/>
    <rect x="2.75" y="9.25" width="18.5" height="12" rx="2"/>
    <path d="M12 11.5L13.03 14.08L15.8 14.26L13.66 16.04L14.35 18.74L12 17.25L9.65 18.74L10.34 16.04L8.2 14.26L10.97 14.08Z"/>
  </g>
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4.25" y="2.75" width="15.5" height="14" rx="3"/>
    <circle cx="12" cy="9.75" r="4.25"/>
    <path d="M12 5.5c-2 2.25-2 6.25 0 8.5M12 5.5c2 2.25 2 6.25 0 8.5M8 21h8"/>
  </g>
</svg>

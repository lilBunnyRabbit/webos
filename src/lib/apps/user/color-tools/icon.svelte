<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12.5 7.5l4 4"/>
    <path d="M14.5 9.5l2.6-2.6a2.12 2.12 0 0 0-3-3l-2.6 2.6"/>
    <path d="M13.5 8.5l-6.75 6.75-1 3 3-1L15.5 10.5"/>
  </g>
  <circle cx="4" cy="20.25" r="1.5" fill="var(--primary)"/>
</svg>

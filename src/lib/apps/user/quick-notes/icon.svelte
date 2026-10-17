<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.25 5.25a2 2 0 0 1 2-2h13.5a2 2 0 0 1 2 2v9l-6.5 6.5h-9a2 2 0 0 1-2-2z"/>
    <path d="M20.75 14.25h-4.5a2 2 0 0 0-2 2v4.5"/>
    <path d="M7.5 11l2.5 2.5 5-5"/>
  </g>
</svg>

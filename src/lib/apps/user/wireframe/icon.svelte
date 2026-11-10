<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.5 9.5h10.5v10.5h-10.5z" />
    <path d="M3.5 9.5l5.5-5.5h10.5v10.5l-5.5 5.5M14 9.5l5.5-5.5" />
    <path d="M3.5 20l5.5-5.5h10.5M9 4v10.5" stroke-dasharray="1.5 2.5" />
  </g>
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.75 3.75h14.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8.5l-4.5 3.5v-3.5h-1.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/>
    <path d="M7.5 8.25h9M7.5 12.25h5.5M4 20.5 20 2.5"/>
  </g>
</svg>

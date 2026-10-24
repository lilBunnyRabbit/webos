<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20.25h-1.75a3.75 3.75 0 0 1-3.6-2.65A3.5 3.5 0 0 1 4.5 11.4a3.25 3.25 0 0 1 1.9-5.6A3.5 3.5 0 0 1 12 4z"/>
    <path d="M12 20.25h1.75a3.75 3.75 0 0 0 3.6-2.65 3.5 3.5 0 0 0 2.15-6.2 3.25 3.25 0 0 0-1.9-5.6A3.5 3.5 0 0 0 12 4"/>
    <path d="M8.25 10.25a3.75 3.75 0 0 1 3.75 3.75M15.75 10.25a3.75 3.75 0 0 0-3.75 3.75"/>
  </g>
</svg>

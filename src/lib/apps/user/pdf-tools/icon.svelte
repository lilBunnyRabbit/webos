<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.25 2.75h-8.5a2 2 0 0 0-2 2v14.5a2 2 0 0 0 2 2h12.5a2 2 0 0 0 2-2V8.75z"/>
    <path d="M14.25 2.75v4a2 2 0 0 0 2 2h4"/>
    <path d="M7.25 17c1.5-3.5 3-5.5 3.75-4.5s-1 3.75 0 3.75 1.75-2 2.75-2 .5 2 1.75 2"/>
  </g>
</svg>

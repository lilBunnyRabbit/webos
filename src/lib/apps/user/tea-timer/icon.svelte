<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.25 10.75h12.5v2.5a5.5 5.5 0 0 1-5.5 5.5h-1.5a5.5 5.5 0 0 1-5.5-5.5z"/>
    <path d="M16.75 11.75h1.25a2.25 2.25 0 0 1 0 4.5h-1.6"/>
    <path d="M3 21.25h15"/>
    <path d="M8.5 2.75c-.75.85-.75 1.65 0 2.5s.75 1.65 0 2.5"/>
    <path d="M12.5 2.75c-.75.85-.75 1.65 0 2.5s.75 1.65 0 2.5"/>
  </g>
</svg>

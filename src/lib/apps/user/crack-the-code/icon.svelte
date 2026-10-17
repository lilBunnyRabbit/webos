<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="10.25" width="18.5" height="11" rx="2"/>
    <path d="M7.5 10.25V6a4.25 4.25 0 0 1 8.5 0v1.25"/>
  </g>
  <path d="M6.25 14.5a1.25 1.25 0 0 1 2.5 0v2.5a1.25 1.25 0 0 1-2.5 0zM10.75 14.5a1.25 1.25 0 0 1 2.5 0v2.5a1.25 1.25 0 0 1-2.5 0zM15.25 14.5a1.25 1.25 0 0 1 2.5 0v2.5a1.25 1.25 0 0 1-2.5 0z" fill="currentColor"/>
</svg>

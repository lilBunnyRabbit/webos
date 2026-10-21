<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.75 2.75h7.5a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2H9l-3 2.75v-2.75H4.75a2 2 0 0 1-2-2v-4.5a2 2 0 0 1 2-2z"/>
    <circle cx="15.75" cy="15.75" r="3.5"/>
    <path d="M18.25 18.25l3 3"/>
  </g>
</svg>

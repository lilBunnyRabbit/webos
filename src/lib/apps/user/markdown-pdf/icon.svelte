<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 6.25v-1.5a2 2 0 0 1 2-2h10.25a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.25"/>
    <rect x="2.75" y="6.25" width="13.25" height="15" rx="2"/>
    <path d="M8 10.25l-.75 7M11.75 10.25l-.75 7M5.75 12.25h7.25M5.25 15.25h7.25"/>
  </g>
</svg>

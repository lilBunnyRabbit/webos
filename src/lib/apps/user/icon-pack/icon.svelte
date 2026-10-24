<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1.75 18.25h1a2 2 0 0 0 2-2v-7.5a2 2 0 0 1 2-2h10.5a2 2 0 0 1 2 2v7.5a2 2 0 0 0 2 2h1M14.75 11l2 2M16.75 11l-2 2"/>
  </g>
  <rect x="7.25" y="9.5" width="5" height="5" rx="1.25" fill="currentColor"/>
</svg>

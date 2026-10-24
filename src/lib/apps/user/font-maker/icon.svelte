<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="2"/>
    <path d="M3.75 16.25h16.5M7.75 16.25c1-5.75 2.5-8.75 4.25-8.75s3.25 3 4.25 8.75M9.5 12.75h5"/>
  </g>
</svg>

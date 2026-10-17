<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.25 17.5V4l3.5 2.25M14.75 21.25v-5M18 21.25V9M21.25 21.25v-8"/>
  </g>
  <ellipse cx="6.25" cy="17.75" rx="3.25" ry="2.75" fill="currentColor"/>
</svg>

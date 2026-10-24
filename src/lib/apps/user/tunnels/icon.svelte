<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <path d="M4.5 4.5V12H12V4.5h7.5v15h-15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="currentColor">
    <circle cx="4.5" cy="4.5" r="1.75"/>
    <circle cx="12" cy="4.5" r="1.75"/>
    <circle cx="19.5" cy="4.5" r="1.75"/>
    <circle cx="4.5" cy="12" r="1.75"/>
    <circle cx="12" cy="12" r="1.75"/>
    <circle cx="19.5" cy="12" r="1.75"/>
    <circle cx="4.5" cy="19.5" r="1.75"/>
    <circle cx="12" cy="19.5" r="1.75"/>
    <circle cx="19.5" cy="19.5" r="1.75"/>
  </g>
</svg>

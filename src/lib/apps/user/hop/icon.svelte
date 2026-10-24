<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="5" cy="4.25" r="1.75"/>
    <path d="M5 7.25V19.5h7V4.5h7v11.25"/>
  </g>
  <circle cx="19" cy="19.75" r="1.75" fill="var(--primary)"/>
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M13 3v3.5M16 2.25v4.25M19 3v3.5M3 13h3.5M2.25 16h4.25M3 19h3.5"/>
  </g>
  <path d="M14.5 11.5h3v3h3v3h-3v3h-3v-3h-3v-3h3z" fill="var(--primary)"/>
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.75 14.25h7.5v3.5h3.5v-3.5h7.5v7H2.75z"/>
  </g>
  <path d="M7.5 3.5h9v3h-3v3h-3v-3h-3z" fill="var(--primary)"/>
</svg>

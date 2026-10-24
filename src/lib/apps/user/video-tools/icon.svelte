<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.75 13.25H10v7.5H4.75a2 2 0 0 1-2-2v-3.5a2 2 0 0 1 2-2zM14 13.25h5.25a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2H14zM6.375 13.25v7.5M17.625 13.25v7.5"/>
  </g>
  <rect x="9" y="3" width="6" height="6" rx="1.5" transform="rotate(-8 12 6)" fill="var(--primary)"/>
</svg>

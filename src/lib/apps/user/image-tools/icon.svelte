<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.75 8.75a2 2 0 0 1 2-2h7.75v5.5h5.75v6.5a2 2 0 0 1-2 2H4.75a2 2 0 0 1-2-2z"/>
    <path d="M2.75 17.25l4.25-4.25 7.5 7.5"/>
  </g>
  <rect x="15.5" y="2" width="5.75" height="5.5" rx="1.5" transform="rotate(12 18.4 4.75)" fill="var(--primary)"/>
</svg>

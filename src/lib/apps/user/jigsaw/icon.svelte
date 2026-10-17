<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.75 9.75H6.25A2.25 2.25 0 1 1 9.75 9.75H11.25a2 2 0 0 1 2 2V13.75A2.25 2.25 0 1 1 13.25 17.25V19.25a2 2 0 0 1-2 2H4.75a2 2 0 0 1-2-2V11.75a2 2 0 0 1 2-2z"/>
  </g>
  <g transform="rotate(12 18.5 6)" fill="var(--primary)">
    <rect x="15.5" y="2.75" width="6" height="6" rx="1.25"/>
    <circle cx="18.5" cy="9" r="1.75"/>
  </g>
</svg>

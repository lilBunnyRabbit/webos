<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="6.25" width="14.5" height="11" rx="2" />
    <circle cx="10" cy="11.75" r="3" />
    <path d="M10 17.25v3.5M6.5 20.75h7" />
  </g>
  <circle cx="20.5" cy="7.5" r="1.75" fill="var(--primary)" />
</svg>

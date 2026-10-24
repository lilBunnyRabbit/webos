<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="6.75" width="10.5" height="10.5" rx="1.75"/>
    <path d="M2.75 6.75l10.5 10.5M13.25 6.75l-10.5 10.5"/>
    <circle cx="18.75" cy="12" r="2.75"/>
  </g>
</svg>

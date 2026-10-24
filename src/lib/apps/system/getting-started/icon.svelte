<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.75" y="2.25" width="15.5" height="12" rx="2"/>
    <path d="M2.75 10.75h15.5"/>
  </g>
  <path d="M16.5 17l5 2.05-2.3.8-.8 2.3z" fill="var(--primary)" stroke="var(--primary)" stroke-width="1" stroke-linejoin="round"/>
</svg>

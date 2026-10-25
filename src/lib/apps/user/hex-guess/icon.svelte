<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <path d="M8.5 3 6.5 15M14 3l-2 12M3.5 6.75h13M2.75 11.25h13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" fill="var(--primary)"/>
</svg>

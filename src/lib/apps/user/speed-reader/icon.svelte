<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.75 4.25h18.5M12 4.25V7M2.75 19.75h18.5M12 19.75V17"/>
  </g>
  <rect x="5" y="10.25" width="14" height="3.5" rx="1.75" fill="currentColor"/>
</svg>

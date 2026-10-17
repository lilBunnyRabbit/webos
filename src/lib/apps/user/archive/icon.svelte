<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2.75v5.5M9.25 5.5L12 8.25l2.75-2.75M12 21.25v-5.5M9.25 18.5L12 15.75l2.75 2.75"/>
    <rect x="2.75" y="10.25" width="18.5" height="3.5" rx="1.75"/>
  </g>
</svg>

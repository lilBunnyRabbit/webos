<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8.25 6.75 9.5 4.5h5l1.25 2.25" />
    <rect x="2.75" y="6.75" width="18.5" height="13" rx="2" />
    <circle cx="12" cy="13.25" r="4" />
    <path d="M12 11.25v2l1.5 1" />
  </g>
</svg>

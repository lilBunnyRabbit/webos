<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 6.5C10 4.9 6.9 4.5 3.25 4.75v13.5c3.65-.25 6.75.15 8.75 1.75 2-1.6 5.1-2 8.75-1.75V4.75C17.1 4.5 14 4.9 12 6.5ZM12 6.5V20"/>
  </g>
</svg>

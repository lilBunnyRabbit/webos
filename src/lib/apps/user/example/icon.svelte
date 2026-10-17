<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.75 21.25h16.5M12 21.25V11.5M12 14.5c-4.5 0-7-2.5-7-7 4.5 0 7 2.5 7 7zM12 11.5c0-4.5 2.5-7.75 7-7.75 0 4.5-2.5 7.75-7 7.75z"/>
  </g>
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18.55 9.53L21.07 10.16L21.07 13.84L18.55 14.47L18.38 14.89L19.71 17.11L17.11 19.71L14.89 18.38L14.47 18.55L13.84 21.07L10.16 21.07L9.53 18.55L9.11 18.38L6.89 19.71L4.29 17.11L5.62 14.89L5.45 14.47L2.93 13.84L2.93 10.16L5.45 9.53L5.62 9.11L4.29 6.89L6.89 4.29L9.11 5.62L9.53 5.45L10.16 2.93L13.84 2.93L14.47 5.45L14.89 5.62L17.11 4.29L19.71 6.89L18.38 9.11z"/>
    <circle cx="12" cy="12" r="3"/>
  </g>
</svg>

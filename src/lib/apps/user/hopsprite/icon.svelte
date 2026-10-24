<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <path d="M3.75 10.25H6.25V2.75H10V10.25H14V2.75H17.75V10.25H20.25V11.75H21.25V19.75H20.25V21.25H3.75V19.75H2.75V11.75H3.75Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M7.25 13.75h2.75v2.75H7.25zM14 13.75h2.75v2.75H14z" fill="currentColor"/>
</svg>

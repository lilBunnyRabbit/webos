<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.75 11.75a2 2 0 0 1 2-2h4l2 2h8.5a2 2 0 0 1 2 2v5.5a2 2 0 0 1-2 2h-14.5a2 2 0 0 1-2-2z"/>
  </g>
  <path d="M13.5 1.5h3.5l2 2v4.25h-5.5z" transform="rotate(-12 16.25 4.65)" fill="var(--primary)"/>
</svg>

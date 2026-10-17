<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8.5 11.25V9M8.5 18.75V21M4.75 15H2.5M12.25 15h2.25M5.85 12.35l-1.6-1.6M11.15 12.35l1.6-1.6M5.85 17.65l-1.6 1.6M11.15 17.65l1.6 1.6"/>
  </g>
  <circle cx="8.5" cy="15" r="3.75" fill="currentColor"/>
  <path d="M18.75 3v10.5" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M19.25 2.75l3.25 2.5-3.25 2.5z" fill="var(--primary)" stroke="var(--primary)" stroke-width="1" stroke-linejoin="round"/>
</svg>

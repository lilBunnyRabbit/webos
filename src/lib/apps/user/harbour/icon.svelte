<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <path d="M3 4.5h18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  <path d="M7.5 4.5v15M16.5 4.5v15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.55" />
  <path d="M12 6.5c1.7 1.2 2.4 3 2.4 5.5v6.5H9.6V12c0-2.5.7-4.3 2.4-5.5Z" fill="var(--primary)" />
</svg>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";

  let { weight: _weight, ...rest }: SVGAttributes<SVGSVGElement> & { weight?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <path
    d="M2.75 8V5a2 2 0 0 1 2-2h3.5M15.75 3h3.5a2 2 0 0 1 2 2v3M21.25 16v3a2 2 0 0 1-2 2h-3.5M8.25 21h-3.5a2 2 0 0 1-2-2v-3"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path d="M7 10.25c2.1-.75 3.9.15 5 2.25 1.1-2.1 2.9-3 5-2.25-1.9.55-3.6 2.15-5 4.75-1.4-2.6-3.1-4.2-5-4.75z" fill="var(--primary)" />
</svg>

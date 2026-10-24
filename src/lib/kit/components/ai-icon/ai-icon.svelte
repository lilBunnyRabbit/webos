<script lang="ts">
  import type { AiIconProps } from "./type";

  let { glyph: Glyph, weight, ...rest }: AiIconProps = $props();

  const uid = $props.id();
  const SPARKLE = "M20 .5c.35 2.25 1.25 3.15 3.5 3.5-2.25.35-3.15 1.25-3.5 3.5-.35-2.25-1.25-3.15-3.5-3.5 2.25-.35 3.15-1.25 3.5-3.5z";
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...rest}>
  <mask id="{uid}-knockout" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
    <rect width="24" height="24" fill="white" />
    <path d={SPARKLE} stroke="black" stroke-width="3" stroke-linejoin="round" />
  </mask>
  <g mask="url(#{uid}-knockout)">
    <Glyph width="24" height="24" {weight} />
  </g>
  <path d={SPARKLE} fill="var(--primary)" />
</svg>

<svelte:options namespace="svg" />

<script lang="ts">
  interface Props {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  let { x, y, width, height }: Props = $props();
  const id = $props.id();
</script>

<defs>
  <pattern id="checker-{id}" {x} {y} width="8" height="8" patternUnits="userSpaceOnUse">
    <rect width="4" height="4" class="fill-foreground/12" />
    <rect x="4" y="4" width="4" height="4" class="fill-foreground/12" />
  </pattern>
</defs>
<rect {x} {y} {width} {height} rx="3" class="fill-background stroke-foreground/20" />
<rect {x} {y} {width} {height} rx="3" fill="url(#checker-{id})" />

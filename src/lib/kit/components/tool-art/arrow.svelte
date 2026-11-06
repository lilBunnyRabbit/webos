<svelte:options namespace="svg" />

<script lang="ts">
  interface Props {
    x1: number;
    x2: number;
    y?: number;
  }

  let { x1, x2, y = 50 }: Props = $props();
</script>

<path
  d="M{x1} {y}H{x2}m-5 -5l5 5l-5 5"
  class="fill-none stroke-foreground/45"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
/>

<script lang="ts">
  import type { LiveProps } from "../registry";
  import type { TurretsOptions } from "./options";
  import TurretsCanvas from "./turrets-canvas.svelte";

  let { context, options }: LiveProps<TurretsOptions> = $props();
</script>

<TurretsCanvas {context} {options} layer="overlay" />

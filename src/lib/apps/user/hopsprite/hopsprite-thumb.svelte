<script lang="ts">
  import { composite_sampled, frame_inputs, same_inputs } from "./composite";
  import type { Sprite } from "./model";

  interface Props {
    sprite: Sprite;
    frame: number;
    size: number;
  }

  let { sprite, frame, size }: Props = $props();

  let canvas = $state<HTMLCanvasElement>();
  let seen = $state(false);
  let drawn: { inputs: readonly unknown[]; width: number; height: number } | null = null;

  const fit = $derived(Math.min(size / sprite.width, size / sprite.height));
  // Sampled in steps so dragging the panel taller rescales thumbnails in CSS instead of recompositing every frame.
  const resolution = $derived(2 ** Math.ceil(Math.log2(Math.max(8, size * (window.devicePixelRatio || 1)))));

  $effect(() => {
    if (!canvas) return;
    const observer = new IntersectionObserver(([entry]) => (seen = entry.isIntersecting), { rootMargin: "0px 200px" });
    observer.observe(canvas);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!canvas || !seen) return;
    const scale = Math.min(1, resolution / Math.max(sprite.width, sprite.height));
    const width = Math.max(1, Math.round(sprite.width * scale));
    const height = Math.max(1, Math.round(sprite.height * scale));
    const inputs = frame_inputs(sprite, frame);
    if (drawn && drawn.width === width && drawn.height === height && same_inputs(drawn.inputs, inputs)) return;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.putImageData(new ImageData(composite_sampled(sprite, frame, width, height), width, height), 0, 0);
    drawn = { inputs, width, height };
  });
</script>

<canvas
  bind:this={canvas}
  class="thumb [image-rendering:pixelated]"
  style:width="{Math.max(1, sprite.width * fit)}px"
  style:height="{Math.max(1, sprite.height * fit)}px"
></canvas>

<style>
  .thumb {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 14%, var(--background)) 0 25%, var(--background) 0 50%) 0 0 / 8px 8px;
  }
</style>

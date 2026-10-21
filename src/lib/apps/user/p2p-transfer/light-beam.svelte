<script lang="ts">
  import { css_rgb, frame_bitmap, frame_modules, type LightStream } from "$kit/utils/light";

  let {
    stream,
    fps,
    version,
    onframe,
  }: { stream: LightStream; fps: number; version: number; onframe: (shown: number) => void } = $props();

  const PIXELS_PER_MODULE = 8;
  /** Two seconds of frames encoded ahead, so a slow encode never shows on screen as a stutter. */
  const AHEAD_SECONDS = 2;

  let canvas = $state<HTMLCanvasElement>();
  const side = $derived(frame_modules(version) * PIXELS_PER_MODULE);

  $effect(() => {
    const element = canvas;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    const style = getComputedStyle(element);
    const ink = { dark: css_rgb(style.color), light: css_rgb(style.backgroundColor) };
    const interval = 1000 / fps;
    const ahead = new Map<number, ImageBitmap>();
    let live = true;
    let rendered = 0;
    let current = 0;
    let due = performance.now();
    let frame = 0;

    const fill = async () => {
      while (live) {
        if (rendered - current >= fps * AHEAD_SECONDS) {
          await new Promise((resolve) => setTimeout(resolve, interval));
          continue;
        }
        const bitmap = await frame_bitmap(stream.frame(rendered), version, ink);
        if (!live) return bitmap.close();
        ahead.set(rendered++, bitmap);
      }
    };

    const tick = (now: number) => {
      if (!live) return;
      const bitmap = ahead.get(current);
      if (now >= due && bitmap) {
        context.drawImage(bitmap, 0, 0, element.width, element.height);
        bitmap.close();
        ahead.delete(current++);
        due = now - due > interval ? now + interval : due + interval;
        onframe(current);
      }
      frame = requestAnimationFrame(tick);
    };

    void fill();
    frame = requestAnimationFrame(tick);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      for (const bitmap of ahead.values()) bitmap.close();
    };
  });
</script>

<!-- Scanners expect dark modules on a light field, so the colours flip with the theme's colour scheme. -->
<canvas
  bind:this={canvas}
  width={side}
  height={side}
  aria-label="Animated code carrying the file"
  class="aspect-square w-full rounded-lg bg-[light-dark(var(--background),var(--foreground))] text-[light-dark(var(--foreground),var(--background-darkest))] [image-rendering:pixelated]"
></canvas>

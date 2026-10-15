<script lang="ts">
  import { round_rect, type Rect } from "./sprite-model";

  let { image, rect, size }: { image: CanvasImageSource; rect: Rect; size: number } = $props();

  function draw(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const src = round_rect(rect);
    if (src.w <= 0 || src.h <= 0) return;
    const scale = Math.min(size / src.w, size / src.h);
    const w = src.w * scale;
    const h = src.h * scale;
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(image, src.x, src.y, src.w, src.h, (size - w) / 2, (size - h) / 2, w, h);
  }
</script>

<canvas class="block [image-rendering:pixelated]" style:width="{size}px" style:height="{size}px" {@attach draw}></canvas>

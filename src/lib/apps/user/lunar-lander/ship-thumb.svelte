<script lang="ts">
  import type { Palette } from "$kit/games/play2d/palette";
  import { cn } from "$lib/core/utils";
  import type { ShipArt } from "./core/art";
  import type { Scenery } from "./core/draw";
  import { paint_ship } from "./core/draw-ship";

  interface Props {
    art: ShipArt;
    palette: Palette;
    scenery: Scenery;
    class?: string;
  }

  let { art, palette, scenery, class: class_name }: Props = $props();

  const WIDTH = 64;
  const HEIGHT = 40;
  let canvas = $state<HTMLCanvasElement>();

  $effect(() => {
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(WIDTH * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    const points = [...art.parts.flatMap((p) => p.shape), ...art.legs.map((l) => l.foot)];
    const half = Math.max(...points.map((p) => Math.abs(p.x))) + art.pad;
    const low = Math.min(...art.legs.map((l) => l.foot.z), ...art.bells.map((b) => b.bell.at.z));
    const high = Math.max(...points.map((p) => p.z));
    const scale = Math.min((WIDTH - 6) / (half * 2), (HEIGHT - 6) / (high - low));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.translate(WIDTH / 2, HEIGHT / 2 + ((high + low) / 2) * scale);
    ctx.scale(scale, -scale);
    paint_ship(
      ctx,
      art,
      { palette, foil: scenery.foil, flame: scenery.flame, flame_glow: scenery.flame_glow, edge: 0.8 / scale, time: 0 },
      { stroke: art.legs.map(() => 0), flames: [], rcs: 0, crew: false }
    );
  });
</script>

<canvas bind:this={canvas} class={cn("block shrink-0 rounded-sm bg-background-darkest", class_name)} style:width="{WIDTH}px" style:height="{HEIGHT}px" aria-hidden="true"></canvas>

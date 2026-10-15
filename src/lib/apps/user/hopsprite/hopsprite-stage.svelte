<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { resolve_token } from "$lib/core/utils";
  import { palette_rgba } from "./color";
  import { composite } from "./composite";
  import type { Editor } from "./editor.svelte";
  import type { Point } from "./model";
  import type { Onion } from "./prefs";
  import { brush_offsets, mask_edges, mirror_points } from "./raster";
  import { is_shape, paints, Tool, type ToolSettings } from "./tools";
  import type { Viewport } from "./viewport.svelte";

  interface Props {
    editor: Editor;
    viewport: Viewport;
    settings: ToolSettings;
    onion: Onion;
    grid: boolean;
    tile: number;
    playing: boolean;
    visible: boolean;
    cursor: Point | null;
  }

  let { editor, viewport, settings, onion, grid, tile, playing, visible, cursor = $bindable() }: Props = $props();

  const theme = $derived(kernel.service<SettingsService>("settings").theme);

  let stage = $state<HTMLDivElement>();
  let sprite_canvas = $state<HTMLCanvasElement>();
  let onion_canvas = $state<HTMLCanvasElement>();
  let overlay = $state<HTMLCanvasElement>();
  let probe = $state<HTMLSpanElement>();
  let space = $state(false);
  let panning = $state(false);
  let ants = $state(0);

  interface Colors {
    grid: string;
    tile: string;
    border: string;
    ants_light: string;
    ants_dark: string;
    cursor: string;
    axis: string;
    before: string;
    after: string;
  }
  let colors = $state.raw<Colors | null>(null);

  const sprite = $derived(editor.display);
  const tool = $derived(settings.tool);
  const hand = $derived(space || tool === Tool.HAND);

  // Theme tokens may be var() or light-dark() expressions a canvas can't parse; resolved a frame after the theme lands.
  $effect(() => {
    Object.values(theme);
    const element = probe;
    if (!element) return;
    const frame = requestAnimationFrame(() => {
      const token = (value: string) => resolve_token(element, value);
      colors = {
        grid: token("color-mix(in oklch, var(--background-darkest) 22%, transparent)"),
        tile: token("color-mix(in oklch, var(--background-darkest) 55%, transparent)"),
        border: token("color-mix(in oklch, var(--foreground) 22%, transparent)"),
        ants_light: token("var(--foreground)"),
        ants_dark: token("var(--background-darkest)"),
        cursor: token("var(--foreground)"),
        axis: token("color-mix(in oklch, var(--primary) 70%, transparent)"),
        before: token("var(--tertiary)"),
        after: token("var(--secondary)"),
      };
    });
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (viewport.width && viewport.height) viewport.pan(Math.round((width - viewport.width) / 2), Math.round((height - viewport.height) / 2));
      viewport.width = width;
      viewport.height = height;
    });
    observer.observe(stage);
    return () => observer.disconnect();
  });

  let fitted = "";
  $effect(() => {
    const key = `${editor.generation}:${sprite.width}x${sprite.height}`;
    if (!viewport.width || !viewport.height) return;
    if (key === fitted) return;
    fitted = key;
    viewport.fit(sprite.width, sprite.height);
  });

  $effect(() => {
    const canvas = sprite_canvas;
    if (!canvas) return;
    const { width, height } = sprite;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const pixels = composite(sprite, editor.frame, { overrides: editor.overrides });
    canvas.getContext("2d")!.putImageData(new ImageData(pixels, width, height), 0, 0);
  });

  $effect(() => {
    const canvas = onion_canvas;
    if (!canvas) return;
    const { width, height } = sprite;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, width, height);
    const palette = colors;
    if (!onion.enabled || playing || !palette) return;

    const scratch = new OffscreenCanvas(width, height);
    const scratch_context = scratch.getContext("2d")!;
    const draw = (offset: number, count: number, tint: string) => {
      const frame = editor.frame + offset;
      if (frame < 0 || frame >= sprite.frames.length) return;
      scratch_context.globalCompositeOperation = "copy";
      scratch_context.putImageData(new ImageData(composite(sprite, frame), width, height), 0, 0);
      if (onion.tint) {
        scratch_context.globalCompositeOperation = "source-atop";
        scratch_context.globalAlpha = 0.7;
        scratch_context.fillStyle = tint;
        scratch_context.fillRect(0, 0, width, height);
        scratch_context.globalAlpha = 1;
      }
      const distance = Math.abs(offset);
      context.globalAlpha = (onion.opacity / 100) * (1 - (distance - 1) / (count + 1));
      context.drawImage(scratch, 0, 0);
    };
    for (let d = onion.before; d >= 1; d--) draw(-d, onion.before, palette.before);
    for (let d = onion.after; d >= 1; d--) draw(d, onion.after, palette.after);
    context.globalAlpha = 1;
  });

  const edges = $derived.by(() => {
    const mask = editor.outline;
    return mask ? mask_edges(mask, sprite.width, sprite.height) : null;
  });

  $effect(() => {
    if (!edges || !visible) return;
    const timer = setInterval(() => (ants = (ants + 1) % 8), 120);
    return () => clearInterval(timer);
  });

  $effect(() => {
    const canvas = overlay;
    const palette = colors;
    if (!canvas || !palette) return;
    const ratio = window.devicePixelRatio || 1;
    const view_width = viewport.width;
    const view_height = viewport.height;
    canvas.width = Math.round(view_width * ratio);
    canvas.height = Math.round(view_height * ratio);
    const context = canvas.getContext("2d")!;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, view_width, view_height);

    const { zoom, x: ox, y: oy } = viewport;
    const { width, height } = sprite;
    const left = Math.max(0, Math.floor(-ox / zoom));
    const right = Math.min(width, Math.ceil((view_width - ox) / zoom));
    const top = Math.max(0, Math.floor(-oy / zoom));
    const bottom = Math.min(height, Math.ceil((view_height - oy) / zoom));
    const sx = (value: number) => Math.round(ox + value * zoom) + 0.5;
    const sy = (value: number) => Math.round(oy + value * zoom) + 0.5;

    const lines = (step: number, color: string) => {
      context.beginPath();
      for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
        context.moveTo(sx(x), sy(top));
        context.lineTo(sx(x), sy(bottom));
      }
      for (let y = Math.ceil(top / step) * step; y <= bottom; y += step) {
        context.moveTo(sx(left), sy(y));
        context.lineTo(sx(right), sy(y));
      }
      context.strokeStyle = color;
      context.lineWidth = 1;
      context.stroke();
    };
    if (grid && zoom >= 6) lines(1, palette.grid);
    if (tile > 1 && tile * zoom >= 6) lines(tile, palette.tile);

    context.strokeStyle = palette.border;
    context.strokeRect(sx(0) - 1, sy(0) - 1, width * zoom + 1, height * zoom + 1);

    if ((settings.mirror_x || settings.mirror_y) && paints(tool)) {
      context.save();
      context.setLineDash([6, 4]);
      context.strokeStyle = palette.axis;
      context.beginPath();
      if (settings.mirror_x) {
        context.moveTo(sx(width / 2), sy(0));
        context.lineTo(sx(width / 2), sy(height));
      }
      if (settings.mirror_y) {
        context.moveTo(sx(0), sy(height / 2));
        context.lineTo(sx(width), sy(height / 2));
      }
      context.stroke();
      context.restore();
    }

    if (edges) {
      context.beginPath();
      for (let i = 0; i < edges.length; i += 4) {
        context.moveTo(sx(edges[i]), sy(edges[i + 1]));
        context.lineTo(sx(edges[i + 2]), sy(edges[i + 3]));
      }
      context.lineWidth = 1;
      context.strokeStyle = palette.ants_dark;
      context.stroke();
      context.save();
      context.setLineDash([4, 4]);
      context.lineDashOffset = -ants;
      context.strokeStyle = palette.ants_light;
      context.stroke();
      context.restore();
    }

    const point = cursor;
    if (!point || hand || editor.stroking || playing) return;
    const brush = (is_shape(tool) && settings.filled) || !(paints(tool) && tool !== Tool.FILL)
      ? [{ x: 0, y: 0 }]
      : brush_offsets(settings.size, settings.shape);
    const table = palette_rgba(sprite.palette);
    const index = editor.primary;
    const fill = tool !== Tool.ERASER && paints(tool) && index > 0
      ? `rgba(${table[index * 4]}, ${table[index * 4 + 1]}, ${table[index * 4 + 2]}, ${(table[index * 4 + 3] / 255) * 0.75})`
      : null;
    const cells = new Set<string>();
    for (const offset of brush) {
      const target = { x: point.x + offset.x, y: point.y + offset.y };
      const mirrored = paints(tool) ? mirror_points(target, width, height, settings.mirror_x, settings.mirror_y) : [target];
      for (const cell of mirrored) cells.add(`${cell.x},${cell.y}`);
    }
    context.lineWidth = 1;
    for (const cell of cells) {
      const [cx, cy] = cell.split(",").map(Number);
      const px = Math.round(ox + cx * zoom);
      const py = Math.round(oy + cy * zoom);
      const size = Math.max(1, Math.round(zoom));
      if (fill) {
        context.fillStyle = fill;
        context.fillRect(px, py, size, size);
      }
      if (zoom >= 4 || !fill) {
        context.strokeStyle = palette.ants_dark;
        context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
        context.strokeStyle = palette.cursor;
        context.strokeRect(px - 0.5, py - 0.5, size + 1, size + 1);
      }
    }
  });

  interface Gesture {
    distance: number;
    mid: Point;
    zoom: number;
    x: number;
    y: number;
  }

  const touches = new Map<number, Point>();
  let gesture: Gesture | null = null;
  let pan: { id: number; x: number; y: number } | null = null;
  let drawing: { id: number; button: number; start: Point } | null = null;
  let long_press: ReturnType<typeof setTimeout> | null = null;

  function local(event: { clientX: number; clientY: number }): Point {
    const box = stage!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function sprite_point(event: { clientX: number; clientY: number }): Point {
    const { x, y } = local(event);
    return viewport.to_sprite(x, y);
  }

  function modifiers(event: PointerEvent) {
    return { shift: event.shiftKey, alt: event.altKey };
  }

  function clear_long_press() {
    if (long_press) clearTimeout(long_press);
    long_press = null;
  }

  function start_gesture() {
    const [a, b] = [...touches.values()];
    gesture = {
      distance: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      zoom: viewport.zoom,
      x: viewport.x,
      y: viewport.y,
    };
  }

  function update_gesture() {
    if (!gesture) return;
    const [a, b] = [...touches.values()];
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoom = Math.min(64, Math.max(0.25, (gesture.zoom * distance) / gesture.distance));
    const anchor_x = (gesture.mid.x - gesture.x) / gesture.zoom;
    const anchor_y = (gesture.mid.y - gesture.y) / gesture.zoom;
    viewport.zoom = zoom;
    viewport.x = Math.round(mid.x - anchor_x * zoom);
    viewport.y = Math.round(mid.y - anchor_y * zoom);
  }

  function end_gesture() {
    if (!gesture) return;
    gesture = null;
    if (viewport.zoom >= 1) viewport.zoom_to(Math.round(viewport.zoom), viewport.width / 2, viewport.height / 2);
  }

  function on_pointerdown(event: PointerEvent) {
    if (playing) return;
    stage!.focus({ preventScroll: true });
    stage!.setPointerCapture(event.pointerId);

    if (event.pointerType === "touch") {
      touches.set(event.pointerId, local(event));
      if (touches.size >= 2) {
        clear_long_press();
        if (drawing) editor.cancel();
        drawing = null;
        start_gesture();
        return;
      }
    }

    if (event.button === 1 || hand) {
      event.preventDefault();
      pan = { id: event.pointerId, x: event.clientX, y: event.clientY };
      panning = true;
      return;
    }
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();

    const point = sprite_point(event);
    cursor = point;
    drawing = { id: event.pointerId, button: event.button, start: local(event) };
    editor.begin(point, event.button, settings, modifiers(event));

    if (event.pointerType === "touch" && tool !== Tool.EYEDROPPER) {
      long_press = setTimeout(() => {
        long_press = null;
        if (!drawing) return;
        editor.cancel();
        editor.pick(point, false);
        drawing = null;
        navigator.vibrate?.(10);
      }, 450);
    }
  }

  function on_pointermove(event: PointerEvent) {
    if (event.pointerType === "touch" && touches.has(event.pointerId)) {
      touches.set(event.pointerId, local(event));
      if (gesture && touches.size >= 2) return update_gesture();
    }
    if (event.pointerType !== "touch") cursor = sprite_point(event);

    if (pan && pan.id === event.pointerId) {
      viewport.pan(event.clientX - pan.x, event.clientY - pan.y);
      pan = { ...pan, x: event.clientX, y: event.clientY };
      return;
    }
    if (!drawing || drawing.id !== event.pointerId) return;
    if (long_press) {
      const here = local(event);
      if (Math.hypot(here.x - drawing.start.x, here.y - drawing.start.y) > 8) clear_long_press();
    }
    if (tool === Tool.EYEDROPPER) return editor.pick(sprite_point(event), drawing.button === 2);
    const samples = event.getCoalescedEvents?.() ?? [];
    const points = (samples.length ? samples : [event]).map(sprite_point);
    if (event.pointerType === "touch") cursor = points[points.length - 1];
    editor.move(points, modifiers(event));
  }

  function on_pointerend(event: PointerEvent, cancelled: boolean) {
    touches.delete(event.pointerId);
    if (gesture && touches.size < 2) {
      end_gesture();
      cursor = null;
      return;
    }
    if (pan?.id === event.pointerId) {
      pan = null;
      panning = false;
    }
    if (drawing?.id !== event.pointerId) return;
    clear_long_press();
    drawing = null;
    if (cancelled) editor.cancel();
    else editor.end();
    if (event.pointerType === "touch") cursor = null;
  }

  let wheel_snap: ReturnType<typeof setTimeout> | null = null;

  function wheel(node: HTMLElement) {
    const on_wheel = (event: WheelEvent) => {
      event.preventDefault();
      const { x, y } = local(event);
      if (event.ctrlKey || event.metaKey) {
        if (Math.abs(event.deltaY) >= 40 && event.deltaMode === 0 && !event.ctrlKey) return viewport.step(event.deltaY < 0 ? 1 : -1, x, y);
        viewport.zoom_to(viewport.zoom * Math.exp(-event.deltaY * 0.01), x, y);
        if (wheel_snap) clearTimeout(wheel_snap);
        wheel_snap = setTimeout(() => {
          if (viewport.zoom >= 1) viewport.zoom_to(Math.round(viewport.zoom), x, y);
        }, 180);
        return;
      }
      const dx = event.shiftKey ? event.deltaY : event.deltaX;
      const dy = event.shiftKey ? 0 : event.deltaY;
      viewport.pan(-dx, -dy);
    };
    node.addEventListener("wheel", on_wheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", on_wheel);
      if (wheel_snap) clearTimeout(wheel_snap);
    };
  }

  function is_editable(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
  }

  $effect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || is_editable(event.target) || !stage?.matches(":hover")) return;
      event.preventDefault();
      space = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") space = false;
    };
    const blur = () => (space = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  });

  $effect(() => () => clear_long_press());
</script>

<div
  bind:this={stage}
  {@attach wheel}
  class={["stage relative min-h-0 min-w-0 overflow-hidden bg-background-darker outline-none", hand ? (panning ? "cursor-grabbing" : "cursor-grab") : "cursor-crosshair"]}
  role="application"
  aria-label="Sprite canvas. Draw with the pointer; two fingers pan and zoom."
  tabindex="-1"
  onpointerdown={on_pointerdown}
  onpointermove={on_pointermove}
  onpointerup={(event) => on_pointerend(event, false)}
  onpointercancel={(event) => on_pointerend(event, true)}
  onlostpointercapture={(event) => on_pointerend(event, false)}
  onpointerleave={(event) => {
    if (event.pointerType !== "touch" && !drawing) cursor = null;
  }}
  oncontextmenu={(event) => event.preventDefault()}
>
  <span bind:this={probe} class="hidden"></span>
  <div
    class="checker pointer-events-none absolute"
    style:left="{viewport.x}px"
    style:top="{viewport.y}px"
    style:width="{sprite.width * viewport.zoom}px"
    style:height="{sprite.height * viewport.zoom}px"
  >
    <canvas bind:this={onion_canvas} class="absolute inset-0 size-full [image-rendering:pixelated]"></canvas>
    <canvas bind:this={sprite_canvas} class="absolute inset-0 size-full [image-rendering:pixelated]"></canvas>
  </div>
  <canvas bind:this={overlay} class="pointer-events-none absolute inset-0 size-full"></canvas>
</div>

<style>
  .stage {
    touch-action: none;
  }

  .checker {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 34%, var(--background)) 0 25%, color-mix(in oklch, var(--foreground) 46%, var(--background)) 0 50%) 0 0 / 16px 16px;
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--foreground) 6%, transparent), 0 12px 32px -12px color-mix(in oklch, var(--background-darkest) 80%, transparent);
  }
</style>

<script lang="ts">
  import kernel, { Platform, type SettingsService } from "$lib/core/api";
  import { untrack } from "svelte";
  import type { SourceImage } from "$kit/utils/image";
  import type { SpriteExtractState } from "./sprite-extract.svelte";
  import type { SpriteOverrides, SpriteSettings } from "./sprite-model";
  import {
    clamp_scale,
    describe_hit,
    draw_sheet,
    fit_view,
    grid_lines,
    HANDLE_SIZE,
    HIT_TOLERANCE,
    hit_cursor,
    hit_test,
    pinch_view,
    read_palette,
    to_image,
    TOUCH_HANDLE_SIZE,
    TOUCH_HIT_TOLERANCE,
    zoom_view,
    type Drag,
    type Hit,
    type Palette,
    type Point,
    type View,
  } from "./sprite-sheet";

  /** Same feel as the shell's long press. */
  const HOLD_MS = 450;
  /** A finger never lands still; movement under this is jitter, not a drag. */
  const SLOP_PX = 8;

  interface Pinch {
    view: View;
    mid: Point;
    distance: number;
  }

  interface Snapshot {
    settings: SpriteSettings;
    overrides: SpriteOverrides;
    sequence: number[];
  }

  interface Props {
    sprite: SpriteExtractState;
    show_labels: boolean;
    pan_mode: boolean;
    zoom?: number;
  }

  let { sprite, show_labels, pan_mode, zoom = $bindable(1) }: Props = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));

  let canvas = $state<HTMLCanvasElement>();
  let size = $state({ w: 0, h: 0, dpr: 1 });
  let view = $state.raw<View>({ scale: 1, offset_x: 0, offset_y: 0 });
  let hover = $state.raw<Hit>({ type: "none" });
  let palette = $state.raw<Palette | null>(null);
  let status = $state("");
  let panning = $state(false);
  let drag: Drag | null = null;
  let fitted_for: SourceImage | null = null;
  let coarse = $state(kernel.platform === Platform.MOBILE);

  const pointers = new Map<number, Point>();
  let pinch: Pinch | null = null;
  /** The touch already did its job (a pinch or a hold); its remaining fingers are ignored until all lift. */
  let spent = false;
  /** Where a touch landed, until it moves past the slop. */
  let press: Point | null = null;
  let hold: ReturnType<typeof setTimeout> | undefined;
  /** Sprite state before an editing drag, so a second finger can take the edit back. */
  let before_edit: Snapshot | null = null;

  const lines = $derived(grid_lines(sprite.grid));
  const sequence = $derived(new Set(sprite.sequence));
  const cursor = $derived(panning ? "grabbing" : pan_mode ? "grab" : hit_cursor(hover, sprite.selected));

  function set_view(next: View) {
    view = { ...next, scale: clamp_scale(next.scale) };
    zoom = view.scale;
  }

  export function fit() {
    if (!sprite.width || !sprite.height || !size.w || !size.h) return;
    set_view(fit_view(sprite.width, sprite.height, size.w, size.h));
  }

  export function zoom_by(factor: number) {
    set_view(zoom_view(view, factor, size.w / 2, size.h / 2));
  }

  $effect(() => {
    const source = sprite.source;
    if (!source || source === fitted_for || !size.w || !size.h) return;
    fitted_for = source;
    untrack(fit);
  });

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(settings.theme);
    if (!canvas) return;
    const probe = canvas;
    const frame = requestAnimationFrame(() => (palette = read_palette(probe)));
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    const ctx = canvas?.getContext("2d");
    if (!ctx || !palette) return;
    const { w, h, dpr } = size;
    const source = sprite.source;
    if (!source) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w * dpr, h * dpr);
      return;
    }
    draw_sheet(ctx, w, h, dpr, {
      image: source.bitmap,
      width: sprite.width,
      height: sprite.height,
      grid: sprite.grid,
      lines,
      overrides: sprite.overrides,
      selected: sprite.selected,
      sequence,
      show_labels,
      view,
      hover,
      palette,
      handle_size: coarse ? TOUCH_HANDLE_SIZE : HANDLE_SIZE,
    });
  });

  $effect(() => () => clearTimeout(hold));

  function observe_size(element: HTMLElement) {
    const observer = new ResizeObserver(() => {
      size = { w: element.clientWidth, h: element.clientHeight, dpr: window.devicePixelRatio || 1 };
    });
    observer.observe(element);
    return () => observer.disconnect();
  }

  function local(event: { clientX: number; clientY: number }) {
    const rect = canvas!.getBoundingClientRect();
    return { sx: event.clientX - rect.left, sy: event.clientY - rect.top };
  }

  function hit_at(sx: number, sy: number): Hit {
    return sprite.source ? hit_test(view, sprite.grid, lines, sprite.selected, sx, sy, coarse ? TOUCH_HIT_TOLERANCE : HIT_TOLERANCE) : { type: "none" };
  }

  function spread(): { mid: Point; distance: number } {
    const [a, b] = pointers.values();
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function end_press() {
    clearTimeout(hold);
    hold = undefined;
    press = null;
  }

  function start_pinch() {
    end_press();
    if (before_edit) {
      sprite.settings = before_edit.settings;
      sprite.overrides = before_edit.overrides;
      sprite.sequence = before_edit.sequence;
      before_edit = null;
    }
    drag = null;
    panning = false;
    spent = false;
    hover = { type: "none" };
    status = "";
    pinch = { view, ...spread() };
  }

  function on_pointerdown(event: PointerEvent) {
    if (!sprite.source) return;
    canvas!.setPointerCapture(event.pointerId);
    const { sx, sy } = local(event);
    coarse = event.pointerType !== "mouse";
    pointers.set(event.pointerId, { x: sx, y: sy });
    if (pointers.size === 2 && event.pointerType !== "mouse") return start_pinch();
    if (pointers.size > 1 || spent) return;
    const pan = (): Drag => ({ kind: "pan", start_x: sx, start_y: sy, offset_x: view.offset_x, offset_y: view.offset_y });

    if (event.button === 1 || pan_mode || (event.button === 0 && event.altKey)) {
      drag = pan();
      panning = true;
      return;
    }
    if (event.button !== 0) return;

    const hit = hit_at(sx, sy);
    const img = to_image(view, sx, sy);
    const edits = hit.type === "handle" || hit.type === "line" || (hit.type === "frame" && hit.index === sprite.selected);
    before_edit = edits ? { settings: sprite.settings, overrides: sprite.overrides, sequence: sprite.sequence } : null;
    if (coarse) {
      press = { x: sx, y: sy };
      // Touch can't double-click, so holding a frame still toggles it instead.
      if (hit.type === "frame") {
        const index = hit.index;
        hold = setTimeout(() => {
          end_press();
          sprite.toggle_in_sequence(index);
          navigator.vibrate?.(8);
          drag = null;
          panning = false;
          before_edit = null;
          spent = true;
        }, HOLD_MS);
      }
    }
    switch (hit.type) {
      case "handle":
        drag = { kind: "frame-resize", index: hit.frame, handle: hit.handle, start: sprite.grid.frames[hit.frame] };
        break;
      case "line":
        drag = { kind: "line", lines: hit.lines };
        break;
      case "frame":
        if (hit.index === sprite.selected) {
          drag = { kind: "frame-move", index: hit.index, start: sprite.grid.frames[hit.index], start_x: img.x, start_y: img.y, moved: false };
        } else {
          sprite.selected = hit.index;
          drag = pan();
        }
        break;
      default:
        sprite.selected = null;
        drag = pan();
    }
  }

  function on_pointermove(event: PointerEvent) {
    if (!sprite.source) return;
    const { sx, sy } = local(event);
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: sx, y: sy });

    if (spent) return;
    if (pinch) {
      if (pointers.size < 2) return;
      const { mid, distance } = spread();
      set_view(pinch_view(pinch.view, pinch.mid, pinch.distance, mid, distance));
      return;
    }

    if (!drag) {
      coarse = event.pointerType !== "mouse";
      hover = hit_at(sx, sy);
      status = describe_hit(view, sprite.grid, sx, sy, hover);
      return;
    }

    if (press) {
      if (Math.hypot(sx - press.x, sy - press.y) <= SLOP_PX) return;
      end_press();
    }

    const img = to_image(view, sx, sy);
    switch (drag.kind) {
      case "pan":
        set_view({ scale: view.scale, offset_x: drag.offset_x + (sx - drag.start_x), offset_y: drag.offset_y + (sy - drag.start_y) });
        break;
      case "line": {
        const axis = drag.lines[0].axis;
        const limit = axis === "column" ? sprite.width : sprite.height;
        const value = Math.round(Math.max(0, Math.min(limit, axis === "column" ? img.x : img.y)));
        for (const line of drag.lines) {
          if (line.outer) {
            sprite.set_padding(line.outer, line.outer === "left" || line.outer === "top" ? value : limit - value);
            sprite.set_line(line.axis, line.index, line.edge, undefined);
          } else {
            sprite.set_line(line.axis, line.index, line.edge, value);
          }
        }
        status = describe_hit(view, sprite.grid, sx, sy, { type: "line", lines: drag.lines.map((l) => ({ ...l, position: value })) });
        break;
      }
      case "frame-move": {
        const dx = Math.round(img.x - drag.start_x);
        const dy = Math.round(img.y - drag.start_y);
        if (!drag.moved && dx === 0 && dy === 0) break;
        drag.moved = true;
        sprite.set_frame_rect(drag.index, { ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy });
        status = describe_hit(view, sprite.grid, sx, sy, { type: "frame", index: drag.index });
        break;
      }
      case "frame-resize": {
        const s = drag.start;
        const px = Math.round(img.x);
        const py = Math.round(img.y);
        let { x, y, w, h } = s;
        if (drag.handle.includes("w")) {
          x = Math.min(px, s.x + s.w - 1);
          w = s.x + s.w - x;
        }
        if (drag.handle.includes("e")) w = Math.max(1, px - s.x);
        if (drag.handle.includes("n")) {
          y = Math.min(py, s.y + s.h - 1);
          h = s.y + s.h - y;
        }
        if (drag.handle.includes("s")) h = Math.max(1, py - s.y);
        sprite.set_frame_rect(drag.index, { x, y, w, h });
        break;
      }
    }
  }

  function on_pointerup(event: PointerEvent) {
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function on_lostpointercapture(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pinch && pointers.size < 2) {
      pinch = null;
      spent = true;
    }
    if (pointers.size) return;
    spent = false;
    end_press();
    before_edit = null;
    drag = null;
    panning = false;
    if (event.pointerType === "mouse") {
      const { sx, sy } = local(event);
      hover = hit_at(sx, sy);
    } else {
      hover = { type: "none" };
      status = "";
    }
  }

  function on_pointerleave() {
    if (drag) return;
    hover = { type: "none" };
    status = "";
  }

  function on_dblclick(event: MouseEvent) {
    const { sx, sy } = local(event);
    const hit = hit_at(sx, sy);
    if (hit.type === "frame") sprite.toggle_in_sequence(hit.index);
  }

  // Wheel listeners must be non-passive to stop the page from scrolling.
  function wheel(element: HTMLCanvasElement) {
    const on_wheel = (event: WheelEvent) => {
      if (!sprite.source) return;
      event.preventDefault();
      const { sx, sy } = local(event);
      if (event.ctrlKey || event.metaKey) {
        set_view(zoom_view(view, Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0025)), sx, sy));
      } else {
        set_view({ scale: view.scale, offset_x: view.offset_x - event.deltaX, offset_y: view.offset_y - event.deltaY });
      }
    };
    element.addEventListener("wheel", on_wheel, { passive: false });
    return () => element.removeEventListener("wheel", on_wheel);
  }
</script>

<div class="relative size-full min-h-0 min-w-0 overflow-hidden" {@attach observe_size}>
  <canvas
    bind:this={canvas}
    width={Math.max(1, Math.floor(size.w * size.dpr))}
    height={Math.max(1, Math.floor(size.h * size.dpr))}
    class="absolute inset-0 block size-full touch-none select-none"
    style:cursor
    aria-label="Sprite sheet"
    onpointerdown={on_pointerdown}
    onpointermove={on_pointermove}
    onpointerup={on_pointerup}
    onpointercancel={on_pointerup}
    onlostpointercapture={on_lostpointercapture}
    onpointerleave={on_pointerleave}
    ondblclick={on_dblclick}
    oncontextmenu={(event) => event.preventDefault()}
    {@attach wheel}
  ></canvas>
  {#if status}
    <span class="pointer-events-none absolute bottom-2 left-2 rounded-sm bg-background/80 px-2 py-0.5 font-mono text-2xs whitespace-pre text-foreground/80">{status}</span>
  {/if}
</div>

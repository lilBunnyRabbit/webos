<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { StatusBar, Toolbar } from "$lib/core/components/ui";
  import { SteeringWheel } from "$kit/components/play2d";
  import { clamp_zoom } from "$kit/games/play2d/camera";
  import { read_palette, type Palette } from "$kit/games/play2d/palette";
  import type { Snippet } from "svelte";
  import type { Helm } from "./core/helm.svelte";
  import { DETENTS, NEUTRAL, ThrottleMode } from "./core/lever";
  import Lever from "./lever.svelte";

  interface Box {
    width: number;
    height: number;
  }

  interface Props {
    label: string;
    helm: Helm;
    throttle: ThrottleMode;
    /** Held sideways the touch controls float over the board; hidden while a card is up so it stays in sight. */
    controls_idle: boolean;
    /** A touch control was used: may start the round; `false` ignores it. */
    engage: () => boolean;
    onkeydown: (event: KeyboardEvent) => void;
    onrelease: () => void;
    onlever?: (notch: number) => void;
    toolbar: Snippet;
    overlay: Snippet;
    status: Snippet;
    board?: HTMLDivElement;
    canvas?: HTMLCanvasElement;
    size?: Box & { dpr: number };
    palette?: Palette | null;
    zoom?: number;
    stage_rect?: DOMRectReadOnly;
    wheel_box?: Box;
    lever_box?: Box;
  }

  let {
    label,
    helm,
    throttle,
    controls_idle,
    engage,
    onkeydown,
    onrelease,
    onlever,
    toolbar,
    overlay,
    status,
    board = $bindable(),
    canvas = $bindable(),
    size = $bindable({ width: 0, height: 0, dpr: 1 }),
    palette = $bindable(null),
    zoom = $bindable(1),
    stage_rect = $bindable(),
    wheel_box = $bindable({ width: 0, height: 0 }),
    lever_box = $bindable({ width: 0, height: 0 }),
  }: Props = $props();

  const system = $derived(kernel.service<SettingsService>("settings"));
  const { window: win } = get_app_context();
  let root: HTMLDivElement | undefined = $state();

  const pinch = new Map<number, { x: number; y: number }>();
  let pinch_start: { distance: number; zoom: number } | null = null;

  $effect(() => {
    if (win.is_focused && board && !root?.contains(document.activeElement)) board.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize[0];
      const pixels = entry.devicePixelContentBoxSize?.[0];
      const dpr = pixels && box.inlineSize ? pixels.inlineSize / box.inlineSize : window.devicePixelRatio;
      size = { width: box.inlineSize, height: box.blockSize, dpr };
    });
    observer.observe(canvas, { box: "device-pixel-content-box" });
    return () => observer.disconnect();
  });

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(system.theme);
    if (!canvas) return;
    const probe = canvas;
    const frame_id = requestAnimationFrame(() => (palette = read_palette(probe)));
    return () => cancelAnimationFrame(frame_id);
  });

  // Closing a menu or the guide drops the focus to the page; the front window still owns the keys.
  function on_window_keydown(event: KeyboardEvent) {
    if (!win.is_focused || (document.activeElement && document.activeElement !== document.body)) return;
    board?.focus({ preventScroll: true });
    onkeydown(event);
  }

  function on_keyup(event: KeyboardEvent) {
    helm.keys.delete(event.code);
  }

  function on_wheel(event: WheelEvent) {
    event.preventDefault();
    zoom = clamp_zoom(zoom * Math.exp(-event.deltaY * 0.0015));
  }

  function on_board_pointerdown(event: PointerEvent) {
    if (event.pointerType !== "touch") return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.size === 2) {
      const [a, b] = [...pinch.values()];
      pinch_start = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  }

  function on_board_pointermove(event: PointerEvent) {
    if (!pinch.has(event.pointerId)) return;
    pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.size !== 2 || !pinch_start) return;
    const [a, b] = [...pinch.values()];
    zoom = clamp_zoom((pinch_start.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch_start.distance));
  }

  function on_board_pointerend(event: PointerEvent) {
    pinch.delete(event.pointerId);
    if (pinch.size < 2) pinch_start = null;
  }

  function set_wheel(value: number) {
    if (engage()) helm.set_wheel(value);
  }

  function set_lever(notch: number) {
    if (!engage()) return;
    if (throttle === ThrottleMode.HOLD) helm.held_lever = DETENTS[notch];
    else helm.set_notch(notch);
    onlever?.(notch);
  }

  function let_go() {
    helm.held_lever = null;
    onlever?.(NEUTRAL);
  }
</script>

<svelte:window onkeydown={on_window_keydown} onkeyup={on_keyup} onblur={onrelease} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="hb-root grid h-full grid-rows-[auto_1fr_auto] [container:hb-app/size]" {onkeydown}>
  <Toolbar class="hb-toolbar">
    {@render toolbar()}
  </Toolbar>

  <div bind:contentRect={stage_rect} class="hb-stage min-h-0 p-2 [container:hb-stage/size] @md:p-3">
    <div class="hb-layout h-full">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={board}
        role="application"
        aria-label={label}
        tabindex="0"
        class="hb-board relative min-h-0 touch-none overflow-hidden rounded-lg ring-1 ring-foreground/8 outline-none select-none [grid-area:board] focus-visible:ring-2 focus-visible:ring-cottontail"
        onwheel={on_wheel}
        onpointerdown={on_board_pointerdown}
        onpointermove={on_board_pointermove}
        onpointerup={on_board_pointerend}
        onpointercancel={on_board_pointerend}
      >
        <canvas bind:this={canvas} class="block size-full"></canvas>
        {@render overlay()}
      </div>

      <div bind:clientWidth={wheel_box.width} bind:clientHeight={wheel_box.height} class={cn("hb-wheel hidden touch-none place-items-center select-none pointer-coarse:grid", controls_idle && "hb-idle")}>
        <SteeringWheel class="hb-wheel-size hb-face" value={helm.wheel} onchange={set_wheel} oncentre={() => set_wheel(0)} />
      </div>
      <div bind:clientWidth={lever_box.width} bind:clientHeight={lever_box.height} class={cn("hb-lever-box hidden touch-none items-end justify-end select-none pointer-coarse:flex", controls_idle && "hb-idle")}>
        <Lever class="hb-lever-size hb-face rounded-xl p-1.5" notch={helm.shown} onchange={set_lever} springs={throttle === ThrottleMode.HOLD} onletgo={let_go} />
      </div>
    </div>
  </div>

  <StatusBar class="hb-status">
    {@render status()}
  </StatusBar>
</div>

<style>
  .hb-layout {
    display: grid;
    gap: 0.5rem;
    grid-template: "board" minmax(0, 1fr) / minmax(0, 1fr);
  }

  .hb-wheel {
    grid-area: wheel;
  }

  .hb-lever-box {
    grid-area: lever;
  }

  .hb-wheel :global(.hb-wheel-size) {
    width: min(10rem, 40cqw);
  }

  .hb-lever-box :global(.hb-lever-size) {
    height: min(11rem, 30cqh);
  }

  @media (pointer: coarse) {
    .hb-stage {
      padding: 0;
    }

    .hb-layout {
      padding: 0.5rem;
      grid-template:
        "board board board" minmax(0, 1fr)
        "wheel . lever" auto / auto minmax(0, 1fr) auto;
    }

    /* Must match OVERLAY_ASPECT: held sideways the board takes the whole stage and the controls float over its sides. */
    @container hb-stage (aspect-ratio > 1.25) {
      .hb-layout {
        position: relative;
        padding: 0;
        grid-template: "board" minmax(0, 1fr) / minmax(0, 1fr);
      }

      .hb-board {
        border-radius: 0;
        box-shadow: none;
      }

      .hb-wheel,
      .hb-lever-box {
        grid-area: auto;
        position: absolute;
        z-index: 1;
        bottom: 0.75rem;
      }

      .hb-wheel {
        left: 0.75rem;
      }

      .hb-lever-box {
        right: 0.75rem;
      }

      .hb-idle {
        visibility: hidden;
      }

      .hb-wheel :global(.hb-wheel-size) {
        width: min(10rem, 58cqh);
      }

      .hb-lever-box :global(.hb-lever-size) {
        height: min(12rem, 70cqh);
      }

      .hb-wheel :global(.hb-face),
      .hb-lever-box :global(.hb-face) {
        background: color-mix(in oklch, var(--background) 55%, transparent);
        backdrop-filter: blur(2px);
      }
    }
  }

  @media (pointer: coarse) {
    @container hb-app (aspect-ratio > 1.25) and (height < 30rem) {
      .hb-root :global(.hb-status) {
        display: none;
      }

      .hb-root :global(.hb-toolbar) {
        min-height: 0;
        padding-block: 0.25rem;
      }
    }
  }
</style>

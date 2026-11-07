<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { Button, IconButton, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon } from "phosphor-svelte";
  import { Lever } from "$kit/components/play2d";
  import { clamp_zoom } from "$kit/games/play2d/camera";
  import { read_palette, type Palette } from "$kit/games/play2d/palette";
  import type { Snippet } from "svelte";
  import { PitchMode, type Controls } from "./core/controls.svelte";
  import { read_scenery, type Scenery } from "./core/draw";
  import PitchPad from "./pitch-pad.svelte";

  interface Box {
    width: number;
    height: number;
  }

  interface Props {
    label: string;
    controls: Controls;
    /** The turn buttons only work on the ground; in the air they stay in place, disabled, so the layout doesn't jump. */
    on_ground: boolean;
    pitch: PitchMode;
    /** Held sideways the touch controls float over the board; hidden while a card is up so it stays in sight. */
    controls_idle: boolean;
    /** A control was used: may resume; `false` ignores it. */
    engage: () => boolean;
    ontrim: () => void;
    onkeydown: (event: KeyboardEvent) => void;
    onrelease: () => void;
    toolbar: Snippet;
    overlay: Snippet;
    status: Snippet;
    board?: HTMLDivElement;
    canvas?: HTMLCanvasElement;
    size?: Box & { dpr: number };
    palette?: Palette | null;
    scenery?: Scenery | null;
    zoom?: number;
    stage_rect?: DOMRectReadOnly;
    left_box?: Box;
    right_box?: Box;
  }

  let {
    label,
    controls,
    on_ground,
    pitch,
    controls_idle,
    engage,
    ontrim,
    onkeydown,
    onrelease,
    toolbar,
    overlay,
    status,
    board = $bindable(),
    canvas = $bindable(),
    size = $bindable({ width: 0, height: 0, dpr: 1 }),
    palette = $bindable(null),
    scenery = $bindable(null),
    zoom = $bindable(1),
    stage_rect = $bindable(),
    left_box = $bindable({ width: 0, height: 0 }),
    right_box = $bindable({ width: 0, height: 0 }),
  }: Props = $props();

  const system = $derived(kernel.service<SettingsService>("settings"));
  const { window: win } = get_app_context();
  let root: HTMLDivElement | undefined = $state();

  const pinch = new Map<number, { x: number; y: number }>();
  let pinch_start: { distance: number; zoom: number } | null = null;
  let drag: { id: number; y: number } | null = null;

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
    const frame_id = requestAnimationFrame(() => {
      palette = read_palette(probe);
      scenery = read_scenery(probe);
    });
    return () => cancelAnimationFrame(frame_id);
  });

  // Closing a menu or the guide drops the focus to the page; the front window still owns the keys.
  function on_window_keydown(event: KeyboardEvent) {
    if (!win.is_focused || (document.activeElement && document.activeElement !== document.body)) return;
    board?.focus({ preventScroll: true });
    onkeydown(event);
  }

  function on_keyup(event: KeyboardEvent) {
    controls.keys.delete(event.code);
  }

  function on_wheel(event: WheelEvent) {
    event.preventDefault();
    zoom = clamp_zoom(zoom * Math.exp(-event.deltaY * 0.0015));
  }

  function on_board_pointerdown(event: PointerEvent) {
    if (event.target instanceof Element && event.target.closest("button")) return;
    if (event.pointerType !== "touch") {
      if (event.button !== 0 || !engage()) return;
      board?.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, y: event.clientY };
      controls.held_stick = 0;
      return;
    }
    pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.size === 2) {
      const [a, b] = [...pinch.values()];
      pinch_start = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  }

  function on_board_pointermove(event: PointerEvent) {
    if (drag && drag.id === event.pointerId) {
      const share = (drag.y - event.clientY) / Math.max(120, size.height * 0.35);
      controls.held_stick = Math.max(-1, Math.min(1, pitch === PitchMode.GAME ? share : -share));
      return;
    }
    if (!pinch.has(event.pointerId)) return;
    pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.size !== 2 || !pinch_start) return;
    const [a, b] = [...pinch.values()];
    zoom = clamp_zoom((pinch_start.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch_start.distance));
  }

  function on_board_lost(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    controls.held_stick = null;
  }

  function on_board_pointerend(event: PointerEvent) {
    pinch.delete(event.pointerId);
    if (pinch.size < 2) pinch_start = null;
  }

  function set_lever(notch: number) {
    if (engage()) controls.set_notch(notch);
  }

  function set_pad(value: number | null) {
    controls.held_stick = value;
  }

  function hold_brake(event: PointerEvent) {
    if (!engage()) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    controls.held_brake = true;
  }

  function flaps(by: number) {
    if (engage()) controls.step_flaps(by);
  }

  function walk(event: PointerEvent, to: number) {
    if (!on_ground || !engage()) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    controls.facing = to;
    controls.held_walk = to;
  }

  function face(to: number) {
    if (on_ground && engage()) controls.facing = to;
  }

  function trim() {
    if (engage()) ontrim();
  }
</script>

<svelte:window onkeydown={on_window_keydown} onkeyup={on_keyup} onblur={onrelease} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="af-root grid h-full grid-rows-[auto_1fr_auto] [container:af-app/size]" {onkeydown}>
  <Toolbar class="af-toolbar">
    {@render toolbar()}
  </Toolbar>

  <div bind:contentRect={stage_rect} class="af-stage min-h-0 p-2 [container:af-stage/size] @md:p-3">
    <div class="af-layout h-full">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={board}
        role="application"
        aria-label={label}
        tabindex="0"
        class="af-board relative min-h-0 touch-none overflow-hidden rounded-lg ring-1 ring-foreground/8 outline-none select-none [grid-area:board] focus-visible:ring-2 focus-visible:ring-cottontail"
        onwheel={on_wheel}
        onpointerdown={on_board_pointerdown}
        onpointermove={on_board_pointermove}
        onpointerup={on_board_pointerend}
        onpointercancel={on_board_pointerend}
        onlostpointercapture={on_board_lost}
      >
        <canvas bind:this={canvas} class="block size-full"></canvas>
        {@render overlay()}
      </div>

      <div bind:clientWidth={left_box.width} bind:clientHeight={left_box.height} class={cn("af-left hidden touch-none items-end select-none pointer-coarse:flex", controls_idle && "af-idle")}>
        <Lever
          class="af-lever-size af-face rounded-xl p-1.5"
          notch={controls.notch}
          labels={controls.cockpit.detents.map((detent) => detent.label)}
          names={controls.cockpit.detents.map((detent) => detent.name)}
          neutral={controls.cockpit.idle}
          label={controls.cockpit.flaps.length > 1 ? "Throttle lever" : "Airbrake lever"}
          onchange={set_lever}
        />
      </div>
      <div class={cn("af-middle hidden touch-none grid-cols-2 gap-1.5 select-none pointer-coarse:grid", controls_idle && "af-idle")}>
        <Button class="af-face h-11 pointer-coarse:h-11" variant="secondary" disabled={controls.cockpit.flaps.length < 2} onclick={() => flaps(-1)} aria-label="Flaps up">Flaps ▲</Button>
        <Button class="af-face h-11 pointer-coarse:h-11" variant="secondary" disabled={controls.cockpit.flaps.length < 2} onclick={() => flaps(1)} aria-label="Flaps down">Flaps ▼</Button>
        <span class="af-flaps-label af-face col-span-2 rounded-md px-1 text-center text-2xs font-medium text-foreground/80">Flaps {controls.flap_name}</span>
        <IconButton class="af-face h-11 w-full min-w-11 rounded-xl pointer-coarse:h-11 pointer-coarse:w-full" variant="secondary" disabled={!on_ground} pressed={controls.facing < 0} label="Turn to face left" onclick={() => face(-1)} onpointerdown={(event) => walk(event, -1)} onlostpointercapture={() => (controls.held_walk = 0)}>
          <CaretLeftIcon weight="bold" />
        </IconButton>
        <IconButton class="af-face h-11 w-full min-w-11 rounded-xl pointer-coarse:h-11 pointer-coarse:w-full" variant="secondary" disabled={!on_ground} pressed={controls.facing > 0} label="Turn to face right" onclick={() => face(1)} onpointerdown={(event) => walk(event, 1)} onlostpointercapture={() => (controls.held_walk = 0)}>
          <CaretRightIcon weight="bold" />
        </IconButton>
        <Button class="af-face h-11 pointer-coarse:h-11" variant="secondary" onclick={trim}>Trim</Button>
        <Button
          class="af-face h-11 pointer-coarse:h-11"
          variant={controls.held_brake ? "primary" : "secondary"}
          aria-pressed={controls.held_brake}
          onpointerdown={hold_brake}
          onlostpointercapture={() => (controls.held_brake = false)}
          oncontextmenu={(event) => event.preventDefault()}>Brake</Button
        >
      </div>
      <div bind:clientWidth={right_box.width} bind:clientHeight={right_box.height} class={cn("af-right hidden touch-none items-end justify-end select-none pointer-coarse:flex", controls_idle && "af-idle")}>
        <PitchPad class="af-pad-size af-face" value={controls.held_stick} pilot={pitch === PitchMode.PILOT} onchange={set_pad} onengage={engage} />
      </div>
    </div>
  </div>

  <StatusBar class="af-status">
    {@render status()}
  </StatusBar>
</div>

<style>
  .af-layout {
    display: grid;
    gap: 0.5rem;
    grid-template: "board" minmax(0, 1fr) / minmax(0, 1fr);
  }

  .af-left {
    grid-area: left;
  }

  .af-middle {
    grid-area: middle;
    align-self: end;
    justify-self: center;
    width: min(100%, 13rem);
  }

  .af-right {
    grid-area: right;
  }

  .af-left :global(.af-lever-size) {
    height: min(11rem, 30cqh);
  }

  .af-right :global(.af-pad-size) {
    height: min(11rem, 30cqh);
    width: 5.5rem;
  }

  @media (pointer: coarse) {
    .af-stage {
      padding: 0;
    }

    .af-layout {
      padding: 0.5rem;
      grid-template:
        "board board board" minmax(0, 1fr)
        "left middle right" auto / auto minmax(0, 1fr) auto;
    }

    /* Must match OVERLAY_ASPECT: held sideways the board takes the whole stage and the controls float over its sides. */
    @container af-stage (aspect-ratio > 1.25) {
      .af-layout {
        position: relative;
        padding: 0;
        grid-template: "board" minmax(0, 1fr) / minmax(0, 1fr);
      }

      .af-board {
        border-radius: 0;
        box-shadow: none;
      }

      .af-left,
      .af-right,
      .af-middle {
        grid-area: auto;
        position: absolute;
        z-index: 1;
        bottom: 0.75rem;
      }

      .af-left {
        left: 0.75rem;
      }

      .af-right {
        right: 0.75rem;
      }

      .af-middle {
        left: 50%;
        translate: -50% 0;
        width: max-content;
        grid-template-columns: repeat(6, auto);
      }

      .af-flaps-label {
        display: none;
      }

      .af-idle {
        visibility: hidden;
      }

      .af-left :global(.af-lever-size) {
        height: min(12rem, 58cqh);
      }

      .af-right :global(.af-pad-size) {
        height: min(12rem, 58cqh);
      }

      .af-root :global(.af-face) {
        background: color-mix(in oklch, var(--background) 55%, transparent);
        backdrop-filter: blur(2px);
      }
    }
  }

  @media (pointer: coarse) {
    @container af-app (aspect-ratio > 1.25) and (height < 30rem) {
      .af-root :global(.af-status) {
        display: none;
      }

      .af-root :global(.af-toolbar) {
        min-height: 0;
        padding-block: 0.25rem;
      }
    }
  }
</style>

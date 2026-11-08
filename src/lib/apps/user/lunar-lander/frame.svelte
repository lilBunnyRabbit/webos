<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { Button, IconButton, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { ArrowArcLeft as TurnLeftIcon, ArrowArcRight as TurnRightIcon } from "phosphor-svelte";
  import { FullScreenButton, Lever } from "$kit/components/play2d";
  import { controls_shown, type OnScreen } from "$kit/games/play2d/onscreen";
  import { read_palette, type Palette } from "$kit/games/play2d/palette";
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { Controls } from "./core/controls.svelte";
  import { read_scenery, type Scenery } from "./core/draw";
  import { HOVER_NOTCH } from "./core/lever";
  import { clamp_view_zoom } from "./core/view";

  interface Box {
    width: number;
    height: number;
  }

  interface Props {
    label: string;
    controls: Controls;
    onscreen: OnScreen;
    /** Held sideways the touch controls float over the board; hidden while a card is up so it stays in sight. */
    controls_idle: boolean;
    /** The pods turn by splitting their thrust, so the buttons say so. */
    split: boolean;
    /** A control was used: may start or resume; `false` ignores it. */
    engage: () => boolean;
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
    onscreen,
    controls_idle,
    split,
    engage,
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
  const coarse = new MediaQuery("(pointer: coarse)", false);
  const shown = $derived(controls_shown(onscreen, coarse.current));

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
    zoom = clamp_view_zoom(zoom * Math.exp(-event.deltaY * 0.0015));
  }

  function on_board_pointerdown(event: PointerEvent) {
    if (event.pointerType !== "touch" || (event.target instanceof Element && event.target.closest("button"))) return;
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
    zoom = clamp_view_zoom((pinch_start.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch_start.distance));
  }

  function on_board_pointerend(event: PointerEvent) {
    pinch.delete(event.pointerId);
    if (pinch.size < 2) pinch_start = null;
  }

  function set_lever(notch: number) {
    if (engage()) controls.set_notch(notch);
  }

  function hold_turn(event: PointerEvent, to: number) {
    if (!engage()) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    controls.held_turn = to;
  }

  function let_go_turn(to: number) {
    if (controls.held_turn === to) controls.held_turn = 0;
  }

  // A pointer press would leave Space, Enter and the lever's arrows on the control; keyboard users tab there on purpose.
  function hand_back() {
    board?.focus({ preventScroll: true });
  }

  function hold_burn(event: PointerEvent) {
    if (!engage()) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    controls.held_burn = true;
  }
</script>

<svelte:window onkeydown={on_window_keydown} onkeyup={on_keyup} onblur={onrelease} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class={cn("ll-root grid h-full [container:ll-app/size]", win.immersive ? "grid-rows-[1fr_auto]" : "grid-rows-[auto_1fr_auto]", shown && "ll-onscreen")} {onkeydown}>
  {#if !win.immersive}
    <Toolbar class="ll-toolbar">
      {@render toolbar()}
      <FullScreenButton />
    </Toolbar>
  {/if}

  <div bind:contentRect={stage_rect} class="ll-stage min-h-0 p-2 [container:ll-stage/size] @md:p-3">
    <div class="ll-layout h-full">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={board}
        role="application"
        aria-label={label}
        tabindex="0"
        class="ll-board relative min-h-0 touch-none overflow-hidden rounded-lg ring-1 ring-foreground/8 outline-none select-none [grid-area:board] focus-visible:ring-2 focus-visible:ring-cottontail"
        onwheel={on_wheel}
        onpointerdown={on_board_pointerdown}
        onpointermove={on_board_pointermove}
        onpointerup={on_board_pointerend}
        onpointercancel={on_board_pointerend}
      >
        <canvas bind:this={canvas} class="block size-full"></canvas>
        {@render overlay()}
      </div>

      <div bind:clientWidth={left_box.width} bind:clientHeight={left_box.height} onpointerup={hand_back} class={cn("ll-left touch-none items-end select-none", shown ? "flex" : "hidden", controls_idle && "ll-idle")}>
        <Lever
          class="ll-lever-size ll-face rounded-xl p-1.5"
          notch={controls.notch}
          labels={controls.detents.map((detent) => detent.label)}
          names={controls.detents.map((detent) => detent.name)}
          neutral={HOVER_NOTCH}
          onchange={set_lever}
        />
      </div>
      <div onpointerup={hand_back} class={cn("ll-middle touch-none select-none", shown ? "flex" : "hidden", controls_idle && "ll-idle")}>
        <Button
          class="ll-face h-11 w-full rounded-xl pointer-coarse:h-14"
          variant={controls.held_burn ? "primary" : "secondary"}
          aria-pressed={controls.held_burn}
          onpointerdown={hold_burn}
          onlostpointercapture={() => (controls.held_burn = false)}
          oncontextmenu={(event) => event.preventDefault()}>Burn</Button
        >
      </div>
      <div bind:clientWidth={right_box.width} bind:clientHeight={right_box.height} onpointerup={hand_back} class={cn("ll-right touch-none items-end justify-end gap-2 select-none", shown ? "flex" : "hidden", controls_idle && "ll-idle")}>
        <IconButton
          class="ll-face ll-turn rounded-xl"
          variant={controls.held_turn < 0 ? "primary" : "secondary"}
          pressed={controls.held_turn < 0}
          label={split ? "Turn left: more thrust on the right pod" : "Turn left"}
          onpointerdown={(event) => hold_turn(event, -1)}
          onlostpointercapture={() => let_go_turn(-1)}
          oncontextmenu={(event) => event.preventDefault()}
        >
          <TurnLeftIcon weight="bold" class="size-7" />
        </IconButton>
        <IconButton
          class="ll-face ll-turn rounded-xl"
          variant={controls.held_turn > 0 ? "primary" : "secondary"}
          pressed={controls.held_turn > 0}
          label={split ? "Turn right: more thrust on the left pod" : "Turn right"}
          onpointerdown={(event) => hold_turn(event, 1)}
          onlostpointercapture={() => let_go_turn(1)}
          oncontextmenu={(event) => event.preventDefault()}
        >
          <TurnRightIcon weight="bold" class="size-7" />
        </IconButton>
      </div>
    </div>
  </div>

  <StatusBar class="ll-status">
    {@render status()}
  </StatusBar>
</div>

<style>
  .ll-layout {
    display: grid;
    gap: 0.5rem;
    grid-template: "board" minmax(0, 1fr) / minmax(0, 1fr);
  }

  .ll-left {
    grid-area: left;
  }

  .ll-middle {
    grid-area: middle;
    align-self: end;
    justify-self: center;
    width: min(100%, 9rem);
  }

  .ll-right {
    grid-area: right;
  }

  .ll-left :global(.ll-lever-size) {
    height: min(11rem, 30cqh);
  }

  .ll-right :global(.ll-turn) {
    width: 4.25rem;
    height: min(5.5rem, 22cqh);
  }

  @media (pointer: fine) {
    .ll-left :global(.ll-lever-size) {
      height: min(9.5rem, 30cqh);
    }

    .ll-right :global(.ll-turn) {
      width: 3.5rem;
      height: min(4.5rem, 22cqh);
    }
  }

  .ll-onscreen .ll-layout {
    grid-template:
      "board board board" minmax(0, 1fr)
      "left middle right" auto / auto minmax(0, 1fr) auto;
  }

  @media (pointer: coarse) {
    .ll-stage {
      padding: 0;
    }

    .ll-layout {
      padding: 0.5rem;
    }
  }

  /* Must match OVERLAY_ASPECT: sideways the board takes the whole stage and the controls float over its sides. */
  @container ll-stage (aspect-ratio > 1.25) {
    .ll-onscreen .ll-layout {
      position: relative;
      grid-template: "board" minmax(0, 1fr) / minmax(0, 1fr);
    }

    .ll-onscreen .ll-left,
    .ll-onscreen .ll-right,
    .ll-onscreen .ll-middle {
      grid-area: auto;
      position: absolute;
      z-index: 1;
      bottom: 0.75rem;
    }

    .ll-onscreen .ll-left {
      left: 0.75rem;
    }

    .ll-onscreen .ll-right {
      right: 0.75rem;
    }

    .ll-onscreen .ll-middle {
      left: 50%;
      translate: -50% 0;
      width: 8rem;
    }

    .ll-onscreen .ll-idle {
      visibility: hidden;
    }

    .ll-onscreen .ll-left :global(.ll-lever-size) {
      height: min(12rem, 58cqh);
    }

    .ll-onscreen .ll-right :global(.ll-turn) {
      height: min(6rem, 40cqh);
    }

    .ll-onscreen :global(.ll-face) {
      background: color-mix(in oklch, var(--background) 55%, transparent);
      backdrop-filter: blur(2px);
    }

    @media (pointer: fine) {
      .ll-onscreen .ll-left :global(.ll-lever-size) {
        height: min(10rem, 45cqh);
      }

      .ll-onscreen .ll-right :global(.ll-turn) {
        height: min(4.5rem, 30cqh);
      }

      .ll-onscreen .ll-middle {
        width: 6.5rem;
      }
    }

    @media (pointer: coarse) {
      .ll-layout {
        position: relative;
        padding: 0;
      }

      .ll-board {
        border-radius: 0;
        box-shadow: none;
      }
    }
  }

  @media (pointer: coarse) {
    @container ll-app (aspect-ratio > 1.25) and (height < 30rem) {
      .ll-root :global(.ll-status) {
        display: none;
      }

      .ll-root :global(.ll-toolbar) {
        min-height: 0;
        padding-block: 0.25rem;
      }
    }
  }
</style>

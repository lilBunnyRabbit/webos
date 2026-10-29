<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { StatusBar, Toolbar } from "$lib/core/components/ui";
  import { ArrowFatLeft as ArrowFatLeftIcon, ArrowFatRight as ArrowFatRightIcon, CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon } from "phosphor-svelte";
  import type { Snippet } from "svelte";
  import { clamp_zoom } from "./camera";
  import { read_palette, type Palette } from "./draw";
  import { BUTTON_KEYS, first_pad, key_event, PadButton, pressed, read_pad } from "./gamepad";
  import type { DriveInput, Hold } from "./drive-input.svelte";
  import { SteeringMode, WheelMode, type DriveSettings } from "./settings.svelte";
  import { Signal } from "./signal";
  import SteeringWheel from "./steering-wheel.svelte";

  interface Box {
    width: number;
    height: number;
  }

  interface Props {
    label: string;
    input: DriveInput;
    settings: DriveSettings;
    /** Held sideways the hidden control leaves its side of the board clear (a card sits on the left there). */
    wheel_idle: boolean;
    pedals_idle: boolean;
    /** Turn signal buttons over the wheel on touch, for a game that judges them. */
    signals?: boolean;
    /** A touch control was pressed: may start the round; `false` ignores the press. */
    engage: () => boolean;
    onpress: (which: Hold) => void;
    onsteer: (value: number) => void;
    onkeydown: (event: KeyboardEvent) => void;
    onrelease: () => void;
    toolbar: Snippet;
    overlay: Snippet;
    status: Snippet;
    /** Over the pedals on touch, for a game's own control (the forklift's Fork). */
    pedal_top?: Snippet;
    root?: HTMLDivElement;
    board?: HTMLDivElement;
    canvas?: HTMLCanvasElement;
    size?: Box & { dpr: number };
    palette?: Palette | null;
    zoom?: number;
    stage_rect?: DOMRectReadOnly;
    steer_box?: Box;
    pedal_box?: Box;
  }

  let {
    label,
    input,
    settings,
    wheel_idle,
    pedals_idle,
    signals = false,
    engage,
    onpress,
    onsteer,
    onkeydown,
    onrelease,
    toolbar,
    overlay,
    status,
    pedal_top,
    root = $bindable(),
    board = $bindable(),
    canvas = $bindable(),
    size = $bindable({ width: 0, height: 0, dpr: 1 }),
    palette = $bindable(null),
    zoom = $bindable(1),
    stage_rect = $bindable(),
    steer_box = $bindable({ width: 0, height: 0 }),
    pedal_box = $bindable({ width: 0, height: 0 }),
  }: Props = $props();

  const system = $derived(kernel.service<SettingsService>("settings"));
  const { window: win } = get_app_context();

  const HINT_MS = 2500;
  let pad_hint = $state(false);

  const pinch = new Map<number, { x: number; y: number }>();
  let pinch_start: { distance: number; zoom: number } | null = null;

  // The window frame focuses itself when it comes to the front; the keys belong on the board inside it.
  $effect(() => {
    if (win.is_focused && board && !root?.contains(document.activeElement)) board.focus({ preventScroll: true });
  });

  // The device-pixel box also fires when only the DPR changes, like moving the window to another screen.
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

  // A controller is polled only while one is connected, a frame at a time; the round's own loop reads what it left in the input.
  $effect(() => {
    let frame_id = 0;
    let hint_timer = 0;
    let before: boolean[] = [];
    let steering = false;

    function poll() {
      frame_id = 0;
      const pad = first_pad(navigator.getGamepads());
      const front = win.is_focused && document.visibilityState === "visible" && document.hasFocus();
      if (!pad || !front) {
        input.set_pad(0, 0);
        release_stick();
        before = pad ? read_pad(pad).buttons : [];
        if (pad) frame_id = requestAnimationFrame(poll);
        return;
      }
      const state = read_pad(pad);
      const edges = pressed(before, state.buttons);
      before = state.buttons;
      input.set_pad(state.gas, state.brake);
      if (state.steer !== null) {
        if (!steering || Math.abs(input.wheel - state.steer) > 1e-3) onsteer(state.steer);
        steering = true;
      } else release_stick();
      for (const index of edges) {
        if (index === PadButton.RT || index === PadButton.LT) {
          if (engage()) onpress(index === PadButton.RT ? "gas" : "brake");
          continue;
        }
        const code = BUTTON_KEYS[index];
        if (code) onkeydown(key_event(code));
      }
      frame_id = requestAnimationFrame(poll);
    }

    function release_stick() {
      if (!steering) return;
      steering = false;
      if (settings.wheel === WheelMode.CENTRES) input.let_go();
    }

    function start() {
      if (!frame_id) frame_id = requestAnimationFrame(poll);
    }

    function on_connected() {
      start();
      if (!win.is_focused) return;
      pad_hint = true;
      clearTimeout(hint_timer);
      hint_timer = window.setTimeout(() => (pad_hint = false), HINT_MS);
    }

    if (first_pad(navigator.getGamepads())) start();
    window.addEventListener("gamepadconnected", on_connected);
    return () => {
      window.removeEventListener("gamepadconnected", on_connected);
      cancelAnimationFrame(frame_id);
      clearTimeout(hint_timer);
    };
  });

  // Closing the guide or a shell menu drops the focus to the page; the front window still owns the keys.
  function on_window_keydown(event: KeyboardEvent) {
    if (!win.is_focused || (document.activeElement && document.activeElement !== document.body)) return;
    board?.focus({ preventScroll: true });
    onkeydown(event);
  }

  function on_keyup(event: KeyboardEvent) {
    input.keys.delete(event.code);
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

  function hold(which: Hold) {
    return {
      onpointerdown: (event: PointerEvent) => {
        event.preventDefault();
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        if (!engage()) return;
        if (input.press(which, event.pointerId)) onpress(which);
      },
      onlostpointercapture: (event: PointerEvent) => input.lift(which, event.pointerId),
      oncontextmenu: (event: Event) => event.preventDefault(),
    };
  }
</script>

<svelte:window onkeydown={on_window_keydown} onkeyup={on_keyup} onblur={onrelease} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="ts-root grid h-full grid-rows-[auto_1fr_auto] [container:ts-app/size]" {onkeydown}>
  <Toolbar class="ts-toolbar">
    {@render toolbar()}
  </Toolbar>

  <div bind:contentRect={stage_rect} class="ts-stage min-h-0 p-2 [container:ts-stage/size] @md:p-3">
    <div class="ts-layout h-full">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={board}
        role="application"
        aria-label={label}
        tabindex="0"
        class="ts-board relative min-h-0 touch-none overflow-hidden rounded-lg ring-1 ring-foreground/8 outline-none select-none [grid-area:board] focus-visible:ring-2 focus-visible:ring-cottontail"
        onwheel={on_wheel}
        onpointerdown={on_board_pointerdown}
        onpointermove={on_board_pointermove}
        onpointerup={on_board_pointerend}
        onpointercancel={on_board_pointerend}
      >
        <canvas bind:this={canvas} class="block size-full"></canvas>
        {@render overlay()}
        {#if pad_hint}
          <p class="ts-pad-hint pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 rounded-full bg-background-lighter px-3 py-1.5 text-ui whitespace-nowrap shadow-popover" role="status">
            Controller connected
          </p>
        {/if}
      </div>

      <div
        bind:clientWidth={steer_box.width}
        bind:clientHeight={steer_box.height}
        class={cn("ts-wheel hidden touch-none place-items-center gap-2 select-none pointer-coarse:grid", wheel_idle && "ts-idle")}
      >
        {#if signals}
          <div class="ts-signals flex gap-3" role="group" aria-label="Turn signals">
            {#each [{ side: Signal.LEFT, label: "Signal left" }, { side: Signal.RIGHT, label: "Signal right" }] as button (button.side)}
              {@const on = input.signal === button.side}
              <button
                type="button"
                class={cn("ts-control ts-pad grid size-11 place-items-center rounded-lg transition-colors", on ? "ts-blink text-warning" : "text-foreground/70")}
                aria-label={button.label}
                aria-pressed={on}
                onmousedown={(event) => event.preventDefault()}
                onclick={() => input.toggle_signal(button.side)}
              >
                {#if button.side === Signal.LEFT}<ArrowFatLeftIcon weight={on ? "fill" : "bold"} class="size-6" />{:else}<ArrowFatRightIcon weight={on ? "fill" : "bold"} class="size-6" />{/if}
              </button>
            {/each}
          </div>
        {/if}
        {#if settings.steering === SteeringMode.BUTTONS}
          <div class="flex gap-2" role="group" aria-label="Steering">
            {#each [{ side: "left", label: "Steer left" }, { side: "right", label: "Steer right" }] as const as button (button.side)}
              <button
                type="button"
                class={cn("ts-control ts-pad ts-steer grid place-items-center rounded-lg transition-colors", input.held[button.side] ? "ts-pad-held" : "text-foreground/80")}
                aria-label={button.label}
                {...hold(button.side)}
              >
                {#if button.side === "left"}<CaretLeftIcon weight="bold" class="size-7" />{:else}<CaretRightIcon weight="bold" class="size-7" />{/if}
              </button>
            {/each}
          </div>
        {:else}
          <SteeringWheel class="ts-wheel-size ts-wheel-face" value={input.wheel} onchange={onsteer} oncentre={() => onsteer(0)} />
        {/if}
      </div>
      <div
        bind:clientWidth={pedal_box.width}
        bind:clientHeight={pedal_box.height}
        class={cn("ts-pedals hidden touch-none flex-col items-end justify-end gap-2 select-none pointer-coarse:flex", pedals_idle && "ts-idle")}
      >
        {@render pedal_top?.()}
        <div class="flex items-end gap-2" role="group" aria-label="Pedals">
        <button
          type="button"
          class={cn("ts-control ts-pad ts-pedal ts-brake rounded-lg text-ui font-medium transition-colors", input.held.brake ? "ts-pad-held" : "text-foreground/80")}
          aria-label="Brake"
          {...hold("brake")}
        >
          Brake
        </button>
        <button
          type="button"
          class={cn("ts-control ts-pad ts-pedal ts-gas rounded-lg text-ui font-medium transition-colors", input.held.gas ? "ts-pad-held ts-pad-gas" : "text-foreground/80")}
          aria-label="Gas"
          {...hold("gas")}
        >
          Gas
        </button>
        </div>
      </div>
    </div>
  </div>

  <StatusBar class="ts-status">
    {@render status()}
  </StatusBar>
</div>

<style>
  .ts-layout {
    display: grid;
    gap: 0.5rem;
    grid-template: "board" minmax(0, 1fr) / minmax(0, 1fr);
  }

  /* Phones held upright: the board on top, the wheel under the left thumb, the pedals under the right. */
  .ts-wheel {
    grid-area: wheel;
  }

  .ts-pedals {
    grid-area: pedals;
  }

  .ts-wheel :global(.ts-wheel-size) {
    width: min(10.5rem, 40cqw);
  }

  .ts-pad {
    background-color: color-mix(in oklch, var(--foreground) 10%, transparent);
  }

  .ts-pad-held {
    color: var(--foreground);
    background-color: color-mix(in oklch, var(--foreground) 25%, transparent);
  }

  .ts-pad-gas {
    background-color: color-mix(in oklch, var(--primary) 35%, transparent);
  }

  .ts-steer {
    width: 4.5rem;
    height: 5rem;
  }

  .ts-pedal {
    width: 4rem;
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0 0.6rem,
      color-mix(in oklch, var(--foreground) 7%, transparent) 0.6rem 0.75rem
    );
    background-clip: padding-box;
  }

  .ts-brake {
    height: 5.5rem;
  }

  .ts-gas {
    height: 8rem;
  }

  @media (pointer: coarse) {
    .ts-stage {
      padding: 0;
    }

    .ts-layout {
      padding: 0.5rem;
      grid-template:
        "board board board" minmax(0, 1fr)
        "wheel . pedals" auto / auto minmax(0, 1fr) auto;
    }

    /* Held sideways the board takes the whole stage and the controls float over its sides at thumb height. */
    @container ts-stage (aspect-ratio > 1.25) {
      .ts-layout {
        position: relative;
        padding: 0;
        grid-template: "board" minmax(0, 1fr) / minmax(0, 1fr);
      }

      .ts-board {
        border-radius: 0;
        box-shadow: none;
      }

      .ts-wheel,
      .ts-pedals {
        grid-area: auto;
        position: absolute;
        z-index: 1;
        bottom: 0.75rem;
      }

      .ts-wheel {
        left: 0.75rem;
        grid-auto-flow: column;
        align-items: end;
      }

      /* Beside the wheel rather than over it, so they stay clear of the HUD along the top. */
      .ts-signals {
        order: 2;
        flex-direction: column;
      }

      .ts-pedals {
        right: 0.75rem;
      }

      .ts-idle {
        visibility: hidden;
      }

      .ts-wheel :global(.ts-wheel-size) {
        width: min(11rem, 62cqh);
      }

      .ts-wheel :global(.ts-wheel-face) {
        background: color-mix(in oklch, var(--background) 45%, transparent);
        backdrop-filter: blur(2px);
      }

      .ts-pad {
        background-color: color-mix(in oklch, var(--background) 65%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 18%, transparent);
        backdrop-filter: blur(2px);
      }

      .ts-pad.ts-pad-held {
        background-color: color-mix(in oklch, var(--foreground) 30%, var(--background));
      }

      .ts-pad.ts-pad-gas {
        background-color: color-mix(in oklch, var(--primary) 45%, var(--background));
      }

      .ts-steer {
        height: min(5rem, 34cqh);
      }

      .ts-brake {
        height: min(6rem, 34cqh);
      }

      .ts-gas {
        height: min(8.5rem, 46cqh);
      }
    }
  }

  /* A phone held sideways: every pixel of height goes to the board, so the status bar folds into the HUD and the toolbar tightens. */
  @media (pointer: coarse) {
    @container ts-app (aspect-ratio > 1.25) and (height < 30rem) {
      .ts-root :global(.ts-status) {
        display: none;
      }

      .ts-root :global(.ts-toolbar) {
        min-height: 0;
        padding-block: 0.25rem;
      }

      .ts-root :global(.ts-fold) {
        display: block;
      }
    }
  }

  .ts-pad-hint {
    animation: ts-pad-hint 2.5s ease both;
  }

  /* In step with the drawn blinkers' period (BLINK_PERIOD). */
  .ts-blink {
    animation: ts-blink 0.8s step-end infinite;
  }

  @keyframes ts-blink {
    50% {
      color: color-mix(in oklch, var(--warning) 35%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ts-blink {
      animation: none;
    }
  }

  :global(html[data-motion="off"]) .ts-blink {
    animation: none;
  }

  @keyframes ts-pad-hint {
    0%,
    100% {
      opacity: 0;
    }
    8%,
    85% {
      opacity: 1;
    }
  }

  :global(.ts-control) {
    touch-action: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
</style>

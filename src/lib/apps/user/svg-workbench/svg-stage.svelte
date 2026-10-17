<script lang="ts" module>
  export const Backdrop = { CHECKER: "checker", LIGHT: "light", DARK: "dark" } as const;
  export type Backdrop = (typeof Backdrop)[keyof typeof Backdrop];

  export interface Pane {
    label: string;
    src: string | null;
    caption?: string;
  }
</script>

<script lang="ts">
  import { Spinner } from "$lib/core/components/ui";
  import { clamp_camera, fit_box, pinch, zoom_at, type Camera, type Point } from "./camera";

  interface Props {
    panes: Pane[];
    ratio: number;
    backdrop: Backdrop;
    camera: Camera;
  }

  let { panes, ratio, backdrop, camera = $bindable() }: Props = $props();

  const TAP_SLOP = 4;

  const pointers = new Map<number, Point>();
  let origin: HTMLElement | null = null;
  let gesture: { kind: "pan"; start: Point; camera: Camera } | { kind: "pinch"; mid: Point; distance: number; camera: Camera } | null = null;

  function centred(element: HTMLElement, event: { clientX: number; clientY: number }): Point {
    const box = element.getBoundingClientRect();
    return { x: event.clientX - box.left - box.width / 2, y: event.clientY - box.top - box.height / 2 };
  }

  function settle(next: Camera, element: HTMLElement) {
    const box = element.getBoundingClientRect();
    const fit = fit_box(ratio, box.width, box.height);
    camera = clamp_camera(next, fit.width, fit.height);
  }

  function spread(): { mid: Point; distance: number } {
    const [a, b] = [...pointers.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function on_pointerdown(event: PointerEvent) {
    if (event.button !== 0 && event.button !== 1) return;
    const pane = event.currentTarget as HTMLElement;
    if (!origin) origin = pane;
    pane.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, centred(origin, event));
    if (pointers.size === 2) gesture = { kind: "pinch", camera, ...spread() };
    else if (pointers.size === 1) gesture = { kind: "pan", start: centred(origin, event), camera };
  }

  function on_pointermove(event: PointerEvent) {
    if (!origin || !pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, centred(origin, event));
    if (gesture?.kind === "pinch" && pointers.size >= 2) {
      const { mid, distance } = spread();
      settle(pinch(gesture.camera, gesture.mid, gesture.distance, mid, distance), origin);
    } else if (gesture?.kind === "pan") {
      const point = pointers.get(event.pointerId)!;
      const dx = point.x - gesture.start.x;
      const dy = point.y - gesture.start.y;
      if (Math.hypot(dx, dy) < TAP_SLOP) return;
      settle({ ...gesture.camera, x: gesture.camera.x + dx, y: gesture.camera.y + dy }, origin);
    }
  }

  function on_pointerend(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pointers.size === 0) {
      gesture = null;
      origin = null;
    } else if (pointers.size === 1 && origin) {
      gesture = { kind: "pan", start: [...pointers.values()][0], camera };
    }
  }

  function on_dblclick(event: MouseEvent) {
    const pane = event.currentTarget as HTMLElement;
    settle(camera.scale > 1 ? { scale: 1, x: 0, y: 0 } : zoom_at(camera, 4, centred(pane, event)), pane);
  }

  // Wheel listeners must be non-passive to keep the page from scrolling.
  function wheel(element: HTMLElement) {
    const on_wheel = (event: WheelEvent) => {
      event.preventDefault();
      const step = event.deltaMode === 1 ? 0.05 : 0.0025;
      if (event.ctrlKey || event.metaKey) settle(zoom_at(camera, Math.exp(-event.deltaY * step), centred(element, event)), element);
      else settle({ ...camera, x: camera.x - event.deltaX, y: camera.y - event.deltaY }, element);
    };
    element.addEventListener("wheel", on_wheel, { passive: false });
    return () => element.removeEventListener("wheel", on_wheel);
  }
</script>

<div class="grid min-h-0 flex-1 auto-rows-fr gap-3 p-3 @lg:auto-cols-fr @lg:grid-flow-col @lg:auto-rows-auto @xl:gap-4 @xl:p-4">
  {#each panes as pane (pane.label)}
    <figure class="flex min-h-0 min-w-0 flex-col gap-1.5">
      <div
        class={["pane relative min-h-24 flex-1 touch-none overflow-hidden rounded-md ring-1 ring-foreground/10 select-none [container-type:size]", backdrop]}
        role="img"
        aria-label={pane.label}
        onpointerdown={on_pointerdown}
        onpointermove={on_pointermove}
        onpointerup={on_pointerend}
        onpointercancel={on_pointerend}
        ondblclick={on_dblclick}
        {@attach wheel}
      >
        {#if pane.src}
          <img
            src={pane.src}
            alt=""
            draggable="false"
            class="absolute top-1/2 left-1/2 max-w-none"
            style:aspect-ratio={ratio}
            style:width="calc(min(100cqw, 100cqh * {ratio}) * {camera.scale})"
            style:transform="translate(calc(-50% + {camera.x}px), calc(-50% + {camera.y}px))"
          />
        {:else}
          <div class="grid size-full place-items-center"><Spinner label="Rendering" /></div>
        {/if}
      </div>
      <figcaption class="flex justify-center gap-2 truncate font-mono text-2xs text-foreground/65 tabular-nums">
        <span class="font-sans font-medium text-foreground/80">{pane.label}</span>{#if pane.caption}<span>{pane.caption}</span>{/if}
      </figcaption>
    </figure>
  {/each}
</div>

<style>
  .pane {
    cursor: grab;
  }

  .pane:active {
    cursor: grabbing;
  }

  /* Light and dark mean the page, not the theme: whichever of foreground and background is lighter, by color-scheme. */
  .light {
    background: light-dark(var(--background), var(--foreground));
  }

  .dark {
    background: light-dark(var(--foreground), var(--background));
  }

  .checker {
    background: var(--background-darker) repeating-conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }
</style>

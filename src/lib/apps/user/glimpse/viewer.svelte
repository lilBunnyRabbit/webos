<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { Badge, Button, IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { fit_view, pinch_view, zoom_view, type Point, type View } from "$kit/utils/view";
  import {
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    ClockClockwise as ClockClockwiseIcon,
    DownloadSimple as DownloadSimpleIcon,
    Trash as TrashIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { batch_title, time_left, type Batch, type Photo, type ViewerItem } from "./photos";
  import { owns_key } from "./keys";
  import { read_photo, read_thumb } from "./store";

  interface Props {
    items: ViewerItem[];
    at: number;
    now: number;
    focused: boolean;
    onmove: (at: number) => void;
    onclose: () => void;
    onsave: (photo: Photo) => void;
    onextend: (batch: Batch, anchor: Point) => void;
    ondelete: (photo: Photo) => void;
  }

  let { items, at, now, focused, onmove, onclose, onsave, onextend, ondelete }: Props = $props();

  const files = $derived(kernel.service<FilesService>("files"));
  const item = $derived(items[at]);
  const photo_id = $derived(item?.photo.id);
  const SWIPE = 60;
  const DOUBLE_ZOOM = 2.5;

  let stage_width = $state(0);
  let stage_height = $state(0);
  let view = $state.raw<View | null>(null);
  let swipe = $state(0);
  let moving = $state(false);
  let root = $state<HTMLElement>();
  let thumb_url = $state<string | null>(null);
  let photo_url = $state<string | null>(null);

  const fit = $derived(item && stage_width > 0 ? fit_view(item.photo.width, item.photo.height, stage_width, stage_height, 0) : null);
  const shown = $derived(view ?? fit);
  const zoomed = $derived(!!view && !!fit && view.scale > fit.scale * 1.01);

  $effect(() => {
    void photo_id;
    view = null;
    swipe = 0;
  });

  $effect(() => {
    const id = photo_id;
    if (!id) return;
    let alive = true;
    const made: string[] = [];
    const load = (read: typeof read_photo, set: (url: string) => void) =>
      read(files, id)
        .then((file) => {
          if (!alive || !file) return;
          const url = URL.createObjectURL(file);
          made.push(url);
          set(url);
        })
        .catch((reason: unknown) => console.warn("[Glimpse] photo failed to load", reason));
    void load(read_thumb, (url) => (thumb_url = url));
    void load(read_photo, (url) => (photo_url = url));
    return () => {
      alive = false;
      made.forEach((url) => URL.revokeObjectURL(url));
      thumb_url = null;
      photo_url = null;
    };
  });

  function move(step: number) {
    const next = at + step;
    if (next >= 0 && next < items.length) onmove(next);
  }

  function clamp(next: View): View | null {
    if (!fit || next.scale <= fit.scale) return null;
    return next;
  }

  function stage_point(event: { clientX: number; clientY: number }, element: HTMLElement): Point {
    const box = element.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  const pointers = new Map<number, Point>();
  let pinch: { view: View; mid: Point; distance: number } | null = null;
  let drag: { start: Point; view: View | null } | null = null;

  const spread = () => {
    const [a, b] = [...pointers.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  function on_pointerdown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const point = stage_point(event, element);
    pointers.set(event.pointerId, point);
    moving = true;
    if (pointers.size === 2 && shown) {
      drag = null;
      swipe = 0;
      pinch = { view: shown, ...spread() };
    } else if (pointers.size === 1) {
      drag = { start: point, view };
    }
  }

  function on_pointermove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    const point = stage_point(event, event.currentTarget as HTMLElement);
    pointers.set(event.pointerId, point);
    if (pinch && pointers.size === 2) {
      const { mid, distance } = spread();
      view = clamp(pinch_view(pinch.view, pinch.mid, pinch.distance, mid, distance));
    } else if (drag?.view) {
      view = { ...drag.view, offset_x: drag.view.offset_x + point.x - drag.start.x, offset_y: drag.view.offset_y + point.y - drag.start.y };
    } else if (drag) {
      swipe = point.x - drag.start.x;
    }
  }

  function on_pointerend(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0) return;
    moving = false;
    if (drag && !drag.view && Math.abs(swipe) > SWIPE) move(swipe < 0 ? 1 : -1);
    drag = null;
    swipe = 0;
  }

  function on_dblclick(event: MouseEvent) {
    if (!fit) return;
    if (zoomed) view = null;
    else {
      const point = stage_point(event, event.currentTarget as HTMLElement);
      view = zoom_view(fit, DOUBLE_ZOOM, point.x, point.y);
    }
  }

  const wheel = (element: HTMLElement) => {
    const on_wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!shown) return;
      const point = stage_point(event, element);
      view = clamp(zoom_view(shown, Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0025)), point.x, point.y));
    };
    element.addEventListener("wheel", on_wheel, { passive: false });
    return () => element.removeEventListener("wheel", on_wheel);
  };

  function on_keydown(event: KeyboardEvent) {
    if (!owns_key(event, root, focused)) return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => move(-1),
      ArrowRight: () => move(1),
      Escape: () => (zoomed ? (view = null) : onclose()),
      Delete: () => item && ondelete(item.photo),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  const focus_on_open = (node: HTMLElement) => node.focus({ preventScroll: true });

  const anchor = (event: MouseEvent): Point => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  };
</script>

<svelte:window onkeydown={on_keydown} />

{#if item}
  <div bind:this={root} class="absolute inset-0 z-10 flex flex-col bg-background-darkest outline-none select-none" role="dialog" aria-label="Photo viewer" tabindex="-1" {@attach focus_on_open}>
    <div class="flex min-w-0 items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
      <IconButton label="Close" onclick={onclose} class="pointer-coarse:size-11"><XIcon weight="bold" /></IconButton>
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-ui font-semibold">{batch_title(item.batch, now)}</span>
        <span class="font-mono text-2xs text-foreground/65 tabular-nums">{at + 1} / {items.length}</span>
      </div>
      <Badge tone={item.batch.expires - now < 3_600_000 ? "warning" : "neutral"} class="font-mono">erases in {time_left(item.batch.expires, now)}</Badge>
    </div>

    <div
      class="relative min-h-0 flex-1 touch-none overflow-hidden"
      role="application"
      aria-label="Photo. Swipe or use the arrow keys for the next one, pinch or scroll to zoom."
      bind:clientWidth={stage_width}
      bind:clientHeight={stage_height}
      onpointerdown={on_pointerdown}
      onpointermove={on_pointermove}
      onlostpointercapture={on_pointerend}
      ondblclick={on_dblclick}
      {@attach wheel}
    >
      {#if shown}
        {#each [thumb_url, photo_url] as url, layer (layer)}
          {#if url}
            <img
              src={url}
              alt=""
              draggable="false"
              class={cn("absolute top-0 left-0 max-w-none origin-top-left", !moving && "transition-transform duration-150")}
              style:width="{item.photo.width}px"
              style:height="{item.photo.height}px"
              style:transform="translate({shown.offset_x + swipe}px, {shown.offset_y}px) scale({shown.scale})"
            />
          {/if}
        {/each}
      {/if}
      {#if at > 0}
        <IconButton label="Previous photo" onclick={() => move(-1)} class="absolute top-1/2 left-2 size-11 -translate-y-1/2 rounded-full bg-background/70 backdrop-blur" onpointerdown={(event) => event.stopPropagation()}>
          <CaretLeftIcon weight="bold" />
        </IconButton>
      {/if}
      {#if at < items.length - 1}
        <IconButton label="Next photo" onclick={() => move(1)} class="absolute top-1/2 right-2 size-11 -translate-y-1/2 rounded-full bg-background/70 backdrop-blur" onpointerdown={(event) => event.stopPropagation()}>
          <CaretRightIcon weight="bold" />
        </IconButton>
      {/if}
    </div>

    <div class="flex items-center justify-center gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <Button onclick={() => onsave(item.photo)}><DownloadSimpleIcon />Save<span class="hidden @sm:inline"> to Pictures</span></Button>
      <Button onclick={(event) => onextend(item.batch, anchor(event))}><ClockClockwiseIcon />Extend</Button>
      <Button variant="quiet" onclick={() => ondelete(item.photo)}><TrashIcon />Delete</Button>
    </div>
  </div>
{/if}

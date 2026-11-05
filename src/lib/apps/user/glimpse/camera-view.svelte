<script lang="ts">
  import kernel, { type DialogsService, type MenuItem } from "$lib/core/api";
  import { Button, IconButton, Segmented, Slider, Spinner } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    Aperture as ApertureIcon,
    CameraRotate as CameraRotateIcon,
    Check as CheckIcon,
    Flashlight as FlashlightIcon,
    Lightning as LightningIcon,
    LightningSlash as LightningSlashIcon,
    VideoCameraSlash as VideoCameraSlashIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { TorchMode, type Camera } from "./camera.svelte";
  import { EXPIRY, type Expiry } from "./photos";
  import { owns_key } from "./keys";
  import Thumb from "./thumb.svelte";

  interface Props {
    camera: Camera;
    expiry: Expiry;
    count: number;
    pending: number;
    last: string | null;
    failed: boolean;
    focused: boolean;
    onexpiry: (expiry: Expiry) => void;
    onshoot: (video: HTMLVideoElement) => void;
    onclose: () => void;
    onlast: () => void;
    onretry: () => void;
  }

  let { camera, expiry, count, pending, last, failed, focused, onexpiry, onshoot, onclose, onlast, onretry }: Props = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const TORCH_NEXT = { [TorchMode.OFF]: TorchMode.FLASH, [TorchMode.FLASH]: TorchMode.ON, [TorchMode.ON]: TorchMode.OFF } as const;
  const TORCH_LABEL = { [TorchMode.OFF]: "Flash off", [TorchMode.FLASH]: "Flash for each shot", [TorchMode.ON]: "Torch on" } as const;
  const TAP_SLOP = 10;

  let video = $state<HTMLVideoElement>();
  let root = $state<HTMLElement>();
  let flashing = $state(false);
  let ring = $state<{ x: number; y: number; key: number } | null>(null);

  const preview = (element: HTMLVideoElement) => {
    const stream = camera.stream;
    if (!stream) return;
    element.srcObject = stream;
    element.play().catch((reason) => console.warn("[Glimpse] preview failed to play", reason));
    return () => {
      element.srcObject = null;
    };
  };

  function shoot() {
    if (!video || !camera.stream || !video.videoWidth) return;
    flashing = true;
    setTimeout(() => (flashing = false), 90);
    onshoot(video);
  }

  function frame_point(client_x: number, client_y: number): { x: number; y: number } | null {
    if (!video?.videoWidth) return null;
    const box = video.getBoundingClientRect();
    const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    let x = (client_x - box.left - (box.width - width) / 2) / width;
    const y = (client_y - box.top - (box.height - height) / 2) / height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    if (camera.mirrored) x = 1 - x;
    return { x, y };
  }

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { zoom: number; distance: number } | null = null;
  let tap: { x: number; y: number } | null = null;

  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function on_pointerdown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) tap = { x: event.clientX, y: event.clientY };
    if (pointers.size === 2) {
      tap = null;
      pinch = camera.zoom_range ? { zoom: camera.zoom, distance: Math.max(1, spread()) } : null;
    }
  }

  function on_pointermove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP) tap = null;
    if (pinch && pointers.size === 2) camera.set_zoom(pinch.zoom * (spread() / pinch.distance));
  }

  function on_pointerend(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0 || !tap || !camera.has_focus) return;
    const point = frame_point(tap.x, tap.y);
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (point) {
      camera.focus_at(point.x, point.y);
      ring = { x: tap.x - box.left, y: tap.y - box.top, key: Date.now() };
    }
    tap = null;
  }

  $effect(() => {
    if (!ring) return;
    const timer = setTimeout(() => (ring = null), 900);
    return () => clearTimeout(timer);
  });

  async function pick_lens(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const items: MenuItem[] = camera.devices.map((device, i) => ({
      id: device.deviceId,
      label: device.label || `Camera ${i + 1}`,
      icon: device.deviceId === camera.device_id ? CheckIcon : undefined,
    }));
    const choice = await dialogs.menu(items, { anchor: { x: rect.left, y: rect.top } });
    if (choice && choice !== camera.device_id) void camera.pick_device(choice);
  }

  function on_keydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const chip = target instanceof HTMLInputElement && target.type === "radio" && !!root?.contains(target);
    if (event.repeat || !(chip ? focused : owns_key(event, root, focused))) return;
    if (event.key === " " && !target?.closest("button")) {
      event.preventDefault();
      shoot();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onclose();
    }
  }

  const upright = $derived(`${camera.tilt}deg`);
</script>

<svelte:window onkeydown={on_keydown} />

<div bind:this={root} class="relative flex h-full min-h-0 flex-col bg-background-darkest select-none">
  <div class="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
    <IconButton label="Close camera" onclick={onclose} class="pointer-coarse:size-11"><XIcon weight="bold" /></IconButton>
    <div class="flex min-w-0 flex-1 justify-center">
      <Segmented label="Erase after" size="sm" options={EXPIRY.map(({ value, label }) => ({ value, label }))} bind:value={() => expiry, (next) => onexpiry(next)} />
    </div>
    {#if camera.has_torch}
      <IconButton label={TORCH_LABEL[camera.torch]} pressed={camera.torch !== TorchMode.OFF} onclick={() => camera.set_torch(TORCH_NEXT[camera.torch])} class="pointer-coarse:size-11">
        <span class="inline-flex transition-[rotate] duration-200" style:rotate={upright}>
          {#if camera.torch === TorchMode.ON}<FlashlightIcon weight="fill" />{:else if camera.torch === TorchMode.FLASH}<LightningIcon weight="fill" />{:else}<LightningSlashIcon weight="bold" />{/if}
        </span>
      </IconButton>
    {:else}
      <span class="size-8 pointer-coarse:size-11" aria-hidden="true"></span>
    {/if}
  </div>

  <div
    class="relative min-h-0 flex-1 touch-none overflow-hidden"
    role="application"
    aria-label={camera.has_focus ? "Camera preview. Tap to focus, pinch to zoom." : "Camera preview"}
    onpointerdown={on_pointerdown}
    onpointermove={on_pointermove}
    onlostpointercapture={on_pointerend}
  >
    {#if camera.stream}
      <video bind:this={video} {@attach preview} autoplay muted playsinline class={cn("size-full object-contain", camera.mirrored && "-scale-x-100")}></video>
    {/if}
    {#if failed}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <VideoCameraSlashIcon class="size-10 text-foreground/65" weight="duotone" />
        <p class="text-ui text-foreground/80">The camera didn't open. Allow it for this site, or close whatever else is using it.</p>
        <Button onclick={onretry}>Try again</Button>
      </div>
    {:else if !camera.stream}
      <div class="absolute inset-0 grid place-items-center"><Spinner label="Opening the camera" /></div>
    {/if}
    {#if ring}
      {#key ring.key}
        <span class="pointer-events-none absolute size-16 -translate-1/2 animate-pop-in rounded-full border-2 border-primary" style:left="{ring.x}px" style:top="{ring.y}px"></span>
      {/key}
    {/if}
    <div class={cn("pointer-events-none absolute inset-0 bg-foreground transition-opacity duration-150", flashing ? "opacity-60" : "opacity-0")}></div>
  </div>

  {#if camera.zoom_range}
    <div class="mx-auto flex w-full max-w-sm items-center gap-2 px-4 pt-2">
      <span class="w-10 text-right font-mono text-2xs text-foreground/80 tabular-nums">{camera.zoom.toFixed(1)}×</span>
      <Slider
        size="sm"
        class="flex-1"
        min={camera.zoom_range.min}
        max={camera.zoom_range.max}
        step={camera.zoom_range.step}
        value={camera.zoom}
        oninput={(event) => camera.set_zoom(Number(event.currentTarget.value))}
        aria-label="Zoom"
      />
    </div>
  {/if}

  <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
    <div class="flex justify-start">
      {#if last || pending > 0}
        <button
          type="button"
          class="relative size-14 rounded-lg ring-2 ring-foreground/30 transition-[rotate] duration-200 hover:opacity-85 active:opacity-70"
          style:rotate={upright}
          aria-label="See this batch, {count} {count === 1 ? 'photo' : 'photos'}"
          onclick={onlast}
        >
          <span class="block size-full overflow-hidden rounded-lg bg-background-darker">
            {#if last}{#key last}<Thumb id={last} />{/key}{:else}<span class="grid size-full place-items-center"><Spinner label="Saving" /></span>{/if}
          </span>
          <span class="absolute -top-2 -right-2 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 font-mono text-2xs font-semibold text-background tabular-nums">{count}</span>
        </button>
      {/if}
    </div>

    <button
      type="button"
      class="group grid size-19 place-items-center rounded-full border-4 border-foreground/90 p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cottontail disabled:opacity-38"
      aria-label="Take a photo"
      disabled={!camera.stream}
      onclick={shoot}
    >
      <span class="block size-full rounded-full bg-primary transition-transform duration-100 group-hover:opacity-85 group-active:scale-90"></span>
    </button>

    <div class="flex items-center justify-end gap-1">
      {#if camera.devices.length > 2}
        <IconButton label="Pick a lens" onclick={pick_lens} class="size-11 rounded-full bg-foreground/8">
          <span class="inline-flex transition-[rotate] duration-200" style:rotate={upright}><ApertureIcon class="size-5" /></span>
        </IconButton>
      {/if}
      {#if camera.can_switch}
        <IconButton label="Switch camera" onclick={() => camera.switch_facing()} class="size-11 rounded-full bg-foreground/8">
          <span class="inline-flex transition-[rotate] duration-200" style:rotate={upright}><CameraRotateIcon class="size-5" /></span>
        </IconButton>
      {/if}
    </div>
  </div>
</div>

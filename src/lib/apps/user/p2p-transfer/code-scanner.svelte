<script lang="ts">
  import { Button, Textarea } from "$lib/core/components/ui";
  import { create_qr_detector, detect_qr, type BarcodeDetector } from "$lib/core/utils/qr";
  import { Camera as CameraIcon, CameraSlash as CameraSlashIcon, PlugsConnected as PlugsConnectedIcon } from "phosphor-svelte";

  /** `onscan` throws when the code is wrong; the scanner shows why and keeps looking. */
  let { onscan }: { onscan: (code: string) => Promise<void> } = $props();

  let detector: Promise<BarcodeDetector> | null = null;
  let stream = $state.raw<MediaStream | null>(null);
  let starting = $state(false);
  let video: HTMLVideoElement | null = $state(null);
  let pasted = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);
  /** The camera sees the same wrong code many times a second; say so once. */
  let rejected: string | null = null;
  let destroyed = false;

  $effect(() => () => {
    destroyed = true;
  });

  async function submit(code: string) {
    if (busy || code === rejected) return;
    busy = true;
    try {
      await onscan(code.trim());
      error = null;
      stream = null;
    } catch (reason) {
      rejected = code;
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      busy = false;
    }
  }

  async function start_camera() {
    starting = true;
    error = null;
    try {
      detector ??= create_qr_detector();
      await detector;
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (destroyed) media.getTracks().forEach((track) => track.stop());
      else stream = media;
    } catch (reason) {
      error = `Couldn't start the camera: ${reason instanceof Error ? reason.message : String(reason)}`;
    } finally {
      starting = false;
    }
  }

  $effect(() => {
    const current = stream;
    if (!current) return;
    return () => current.getTracks().forEach((track) => track.stop());
  });

  $effect(() => {
    if (!stream || !video || !detector) return;
    const element = video;
    const ready = detector;
    element.srcObject = stream;
    element.play().catch((reason) => console.warn("[P2PTransfer] camera preview failed to play", reason));

    let active = true;
    let handle = 0;
    const scan = async () => {
      const content = await detect_qr(await ready, element).catch(() => null);
      if (!active) return;
      if (content) await submit(content);
      if (active) handle = element.requestVideoFrameCallback(scan);
    };
    handle = element.requestVideoFrameCallback(scan);

    return () => {
      active = false;
      element.cancelVideoFrameCallback(handle);
      element.srcObject = null;
    };
  });
</script>

<div class="flex flex-col gap-3">
  {#if stream}
    <div class="relative mx-auto overflow-hidden rounded-lg bg-background-darker">
      <video bind:this={video} muted playsinline class="block max-h-64 max-w-full"></video>
      <div class="pointer-events-none absolute inset-0 animate-pulse rounded-lg ring-2 ring-primary ring-inset"></div>
    </div>
    <Button variant="quiet" size="sm" class="self-center" onclick={() => (stream = null)}><CameraSlashIcon weight="bold" /> Stop camera</Button>
  {:else}
    <Button variant="primary" class="self-center" disabled={starting} onclick={start_camera}><CameraIcon weight="bold" /> Scan with camera</Button>
  {/if}

  <form
    class="flex flex-col gap-2"
    onsubmit={(event) => {
      event.preventDefault();
      rejected = null;
      void submit(pasted);
    }}
  >
    <Textarea mono bind:value={pasted} rows={3} placeholder="…or paste the code here" aria-label="Connection code" class="min-h-16" />
    <Button type="submit" size="sm" class="self-end" disabled={busy || !pasted.trim()}><PlugsConnectedIcon weight="bold" /> Connect</Button>
  </form>

  {#if error}
    <p role="alert" class="text-ui text-error">{error}</p>
  {/if}
</div>

<script lang="ts">
  import { Button, Textarea } from "$lib/core/components/ui";
  import Viewfinder from "./viewfinder.svelte";
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
  <Viewfinder scanning={!!stream}>
    {#if stream}
      <video bind:this={video} muted playsinline class="size-full bg-background-darker object-cover"></video>
    {:else}
      <div class="grid size-full place-items-center bg-[light-dark(var(--background-lightest),var(--background-darker))]">
        <Button variant="primary" disabled={starting} onclick={start_camera}><CameraIcon weight="bold" /> Scan with camera</Button>
      </div>
    {/if}
  </Viewfinder>
  {#if stream}
    <Button variant="quiet" size="sm" class="self-center" onclick={() => (stream = null)}><CameraSlashIcon weight="bold" /> Stop camera</Button>
  {/if}

  <form
    class="flex flex-col gap-2"
    onsubmit={(event) => {
      event.preventDefault();
      rejected = null;
      void submit(pasted);
    }}
  >
    <Textarea mono bind:value={pasted} rows={3} placeholder="WEBOS-P2P1|… paste the code here" aria-label="Connection code" class="min-h-16" />
    <Button type="submit" size="sm" class="self-end" disabled={busy || !pasted.trim()}><PlugsConnectedIcon weight="bold" /> Connect</Button>
  </form>

  {#if error}
    <p role="alert" class="font-mono text-2xs text-error">ERR {error}</p>
  {/if}
</div>

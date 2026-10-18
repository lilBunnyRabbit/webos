<script lang="ts">
  import { Button, Textarea, button } from "$lib/core/components/ui";
  import Viewfinder from "./viewfinder.svelte";
  import { create_qr_detector, detect_qr, type BarcodeDetector } from "$kit/utils/qr";
  import { Aperture as ApertureIcon, Camera as CameraIcon, CameraSlash as CameraSlashIcon, PlugsConnected as PlugsConnectedIcon } from "phosphor-svelte";
  import { error_message } from "$lib/core/utils";
  import { CameraScan } from "$kit/utils/qr-scan.svelte";
  import { get_app_context } from "$lib/core/contexts/app";

  /** `onscan` throws when the code is wrong; the scanner shows why and keeps looking. */
  let { onscan }: { onscan: (code: string) => Promise<void> } = $props();

  const { window: win } = get_app_context();
  let detector: Promise<BarcodeDetector> | null = null;
  let pasted = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);
  /** The camera sees the same wrong code many times a second; say so once. */
  let rejected: string | null = null;

  // A QR on another screen is small and close: more pixels and continuous autofocus (Android) read it far sooner.
  const camera = new CameraScan({
    constraints: {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
    },
    detector: () => (detector ??= create_qr_detector()),
    visible: () => win.is_visible,
    oncode: (code) => submit(code),
    onerror: (reason) => (error = `Couldn't start the camera: ${error_message(reason)}`),
  });

  async function submit(code: string): Promise<boolean> {
    if (busy || code === rejected) return false;
    busy = true;
    try {
      await onscan(code);
      error = null;
      camera.stop();
      return true;
    } catch (reason) {
      rejected = code;
      error = error_message(reason);
      return false;
    } finally {
      busy = false;
    }
  }

  function start_camera() {
    error = null;
    void camera.start();
  }

  /** A still from the phone's own camera app, which focuses properly on a screen, unlike a live preview. */
  async function scan_photo(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const [file] = input.files ?? [];
    input.value = "";
    if (!file) return;
    let bitmap: ImageBitmap | undefined;
    try {
      detector ??= create_qr_detector();
      bitmap = await createImageBitmap(file);
      const content = await detect_qr(await detector, bitmap);
      if (!content) error = "No QR code in that photo. Fill the frame with the code and try again";
      else {
        rejected = null;
        await submit(content);
      }
    } catch (reason) {
      error = `Couldn't read the photo: ${error_message(reason)}`;
    } finally {
      bitmap?.close();
    }
  }
</script>

<div class="flex flex-col gap-3">
  <Viewfinder scanning={camera.active}>
    {#if camera.active}
      <video {@attach camera.preview} autoplay muted playsinline class="size-full bg-background-darker object-cover"></video>
    {:else}
      <div class="grid size-full place-items-center bg-[light-dark(var(--background-lightest),var(--background-darker))]">
        <Button variant="primary" disabled={camera.starting} onclick={start_camera}><CameraIcon weight="bold" /> Scan with camera</Button>
      </div>
    {/if}
  </Viewfinder>
  <div class="flex flex-wrap justify-center gap-1">
    {#if camera.active}
      <Button variant="quiet" size="sm" onclick={() => camera.stop()}><CameraSlashIcon weight="bold" /> Stop camera</Button>
    {/if}
    <label class={button({ variant: "quiet", size: "sm" })}>
      <ApertureIcon weight="bold" /> Take photo
      <input type="file" accept="image/*" capture="environment" class="sr-only" onchange={scan_photo} />
    </label>
  </div>

  <form
    class="flex flex-col gap-2"
    onsubmit={(event) => {
      event.preventDefault();
      rejected = null;
      void submit(pasted);
    }}
  >
    <Textarea mono bind:value={pasted} rows={3} placeholder="Paste the code here" aria-label="Connection code" class="min-h-16" />
    <Button type="submit" size="sm" class="self-end" disabled={busy || !pasted.trim()}><PlugsConnectedIcon weight="bold" /> Connect</Button>
  </form>

  {#if error}
    <p role="alert" class="font-mono text-2xs text-error">ERR {error}</p>
  {/if}
</div>

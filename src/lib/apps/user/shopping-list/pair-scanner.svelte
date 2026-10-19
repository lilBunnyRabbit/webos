<script lang="ts">
  import { Button, Textarea, button } from "$lib/core/components/ui";
  import { create_qr_detector, detect_qr, type BarcodeDetector } from "$kit/utils/qr";
  import { CameraScan } from "$kit/utils/qr-scan.svelte";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message } from "$lib/core/utils";
  import { Aperture as ApertureIcon, Camera as CameraIcon, CameraSlash as CameraSlashIcon } from "phosphor-svelte";

  /** `onscan` throws when the code is wrong; the scanner shows why and keeps looking. */
  let { onscan, label }: { onscan: (code: string) => Promise<void>; label: string } = $props();

  const { window: win } = get_app_context();
  let detector: Promise<BarcodeDetector> | null = null;
  let pasted = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);
  /** The camera sees the same wrong code many times a second; say so once. */
  let rejected: string | null = null;

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
      await onscan(code.trim());
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

<div class="flex w-full flex-col items-center gap-3">
  <div class="relative aspect-square w-full max-w-64 overflow-hidden rounded-lg bg-[light-dark(var(--background-lightest),var(--background-darker))] ring-1 ring-foreground/8">
    {#if camera.active}
      <video {@attach camera.preview} autoplay muted playsinline aria-label={label} class="size-full object-cover"></video>
    {:else}
      <div class="grid size-full place-items-center p-4">
        <Button variant="primary" size="lg" disabled={camera.starting} onclick={() => ((error = null), void camera.start())}>
          <CameraIcon weight="bold" /> Scan with camera
        </Button>
      </div>
    {/if}
  </div>

  <div class="flex flex-wrap justify-center gap-1">
    {#if camera.active}
      <Button variant="quiet" size="sm" onclick={() => camera.stop()}><CameraSlashIcon weight="bold" /> Stop camera</Button>
    {/if}
    <label class={button({ variant: "quiet", size: "sm" })}>
      <ApertureIcon weight="bold" /> Take photo
      <input type="file" accept="image/*" capture="environment" class="sr-only" onchange={scan_photo} />
    </label>
  </div>

  {#if error}
    <p role="alert" class="max-w-72 text-center text-ui text-error">{error}</p>
  {/if}

  <details class="w-full max-w-72 text-ui">
    <summary class="cursor-pointer text-center text-foreground/65">Paste a code instead</summary>
    <form
      class="mt-2 flex flex-col gap-2"
      onsubmit={(event) => {
        event.preventDefault();
        rejected = null;
        void submit(pasted);
      }}
    >
      <Textarea mono bind:value={pasted} rows={3} placeholder="Paste the code here" aria-label="Pairing code" class="min-h-16" />
      <Button type="submit" size="sm" class="self-end" disabled={busy || !pasted.trim()}>Connect</Button>
    </form>
  </details>
</div>

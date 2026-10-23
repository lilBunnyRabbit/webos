<script lang="ts">
  import kernel, { type AppsService, type FilesService } from "$lib/core/api";
  import { PATHS } from "$lib/core/api/services/files/hierarchy";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button } from "$lib/core/components/ui";
  import { error_message, format_bytes } from "$lib/core/utils";
  import { create_qr_detector, type BarcodeDetector } from "$kit/utils/qr";
  import { CameraScan } from "$kit/utils/qr-scan.svelte";
  import type { LightFile } from "$kit/utils/light";
  import { Camera as CameraIcon, CameraSlash as CameraSlashIcon, FolderOpen as FolderOpenIcon } from "phosphor-svelte";
  import BlockBar from "./block-bar.svelte";
  import { safe_name } from "./protocol";
  import Viewfinder from "./viewfinder.svelte";
  import { LightPhase, type LightReceiver } from "./light.svelte";

  let { receiver }: { receiver: LightReceiver } = $props();

  const { window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  let detector: Promise<BarcodeDetector> | null = null;
  let camera_error = $state<string | null>(null);

  const camera = new CameraScan({
    constraints: {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
      advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
    },
    detector: () => (detector ??= create_qr_detector()),
    visible: () => win.is_visible,
    oncode: (code) => receiver.take(code, save),
    onerror: (reason) => (camera_error = `Couldn't start the camera: ${error_message(reason)}`),
  });

  $effect(() => {
    receiver.camera = camera.active;
  });
  $effect(() => () => (receiver.camera = false));

  async function save(file: LightFile): Promise<string> {
    const [path] = await files.import_entries(PATHS.downloads, [new File([file.bytes], safe_name(file.name), { type: file.type })]);
    return path;
  }

  function start() {
    camera_error = null;
    if (receiver.phase === LightPhase.DONE) receiver.reset();
    void camera.start();
  }

  function again() {
    receiver.reset();
    start();
  }

  const percent = $derived((receiver.progress * 100).toFixed(receiver.progress === 1 ? 0 : 1));
</script>

{#if receiver.phase === LightPhase.DONE && receiver.saved_path}
  <section class="flex flex-col items-center gap-3 rounded-xl bg-background-light p-4 shadow-card ring-1 ring-hairline">
    <span class="font-mono text-2xs font-medium tracking-wide text-success uppercase">Saved · SHA-256 checked</span>
    <span class="max-w-full truncate text-sm font-semibold">{receiver.header?.name}</span>
    <span class="max-w-full truncate font-mono text-2xs text-foreground/80" title={receiver.saved_path}>→ {receiver.saved_path}</span>
    <div class="flex flex-wrap justify-center gap-2">
      <Button size="sm" onclick={() => apps.open(receiver.saved_path!)}><FolderOpenIcon weight="bold" /> Open</Button>
      <Button variant="primary" size="sm" onclick={again}>Receive another</Button>
    </div>
  </section>
{:else}
  <div class="flex flex-col gap-3">
    <Viewfinder scanning={camera.active}>
      {#if camera.active}
        <video {@attach camera.preview} autoplay muted playsinline aria-label="Camera looking for the sender's codes" class="size-full bg-background-darker object-cover"></video>
      {:else}
        <div class="grid size-full place-items-center bg-[light-dark(var(--background-lightest),var(--background-darker))]">
          <Button variant="primary" disabled={camera.starting} onclick={start}><CameraIcon weight="bold" /> Scan with camera</Button>
        </div>
      {/if}
    </Viewfinder>
    {#if camera.active}
      <Button variant="quiet" size="sm" class="self-center" onclick={() => camera.stop()}><CameraSlashIcon weight="bold" /> Stop camera</Button>
    {/if}
  </div>

  <section class="flex flex-col gap-3 rounded-xl bg-background-light p-3 shadow-card ring-1 ring-hairline" aria-live="polite">
    <div class="flex items-end justify-between gap-3">
      <div class="flex min-w-0 flex-col">
        <span class="font-mono text-2xs font-medium tracking-wide text-foreground/80 uppercase">
          {receiver.phase === LightPhase.SAVING ? "Checking" : receiver.frames > 0 ? "Receiving" : "Waiting for codes"}
        </span>
        <span class="font-mono text-3xl font-semibold tabular-nums">{percent}<span class="text-lg text-foreground/65">%</span></span>
      </div>
      <dl class="grid grid-cols-[auto_auto] gap-x-3 text-right font-mono text-2xs tabular-nums">
        <dt class="text-foreground/80 uppercase">Size</dt>
        <dd>{receiver.header ? format_bytes(receiver.header.size) : "—"}</dd>
        <dt class="text-foreground/80 uppercase">Rate</dt>
        <dd>{receiver.rate > 0 ? `${format_bytes(receiver.rate)}/s` : "—"}</dd>
        <dt class="text-foreground/80 uppercase">Frames</dt>
        <dd>{receiver.frames}</dd>
      </dl>
    </div>
    <BlockBar value={receiver.progress} class="h-2" />
    {#if receiver.header}
      <span class="truncate text-ui">{receiver.header.name}</span>
    {/if}
  </section>

  <p class="text-center text-ui text-foreground/65">
    On the other device: P2P Transfer, Send, By light, pick a file, Start sending. Fill this camera's view with the code and hold still. Missed codes only cost time.
  </p>

  {#if camera_error ?? receiver.error}
    <p role="alert" class="text-center text-ui text-error">{camera_error ?? receiver.error}</p>
  {/if}
{/if}

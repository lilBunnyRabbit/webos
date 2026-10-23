<script lang="ts">
  import { Button } from "$lib/core/components/ui";
  import { cn, error_message } from "$lib/core/utils";
  import { create_qr_detector, type BarcodeDetector } from "$kit/utils/qr";
  import { CameraScan } from "$kit/utils/qr-scan.svelte";
  import { CollectResult, FrameCollector } from "$kit/utils/qr-transfer";
  import { Camera as CameraIcon } from "phosphor-svelte";
  import { untrack } from "svelte";

  interface Props {
    /** The tag the sender used in `encode_frames`. */
    app: string;
    label: string;
    /** Frames that aren't `app`'s; say what they are, like "That's a Cards code". Without it they're ignored. */
    foreign?: (text: string) => string | null;
    /** Throw to reject the payload: the message shows and scanning starts over. */
    onpayload: (payload: unknown) => void | Promise<void>;
    /** Whether the window is on screen: the camera is released while it isn't. */
    visible: () => boolean;
  }

  let { app, label, foreign, onpayload, visible }: Props = $props();

  const collector = new FrameCollector(untrack(() => app));
  let got = $state(0);
  let total = $state(0);
  /** Which codes are in, by position, for the progress dots. */
  let have = $state<boolean[]>([]);
  let error = $state<string | null>(null);
  let detector: Promise<BarcodeDetector> | null = null;
  let finishing = false;

  const camera = new CameraScan({
    constraints: {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
    },
    detector: () => (detector ??= create_qr_detector()),
    visible: () => visible(),
    oncode: (code) => take(code),
    onerror: (reason) => (error = `Couldn't start the camera: ${error_message(reason)}`),
  });

  async function take(code: string): Promise<boolean> {
    if (finishing) return false;
    const result = collector.add(code);
    if (result === CollectResult.NOT_A_FRAME) return false;
    if (result === CollectResult.FOREIGN) {
      error = foreign?.(code) ?? null;
      return false;
    }
    got = collector.got;
    total = collector.total;
    have = Array.from({ length: total }, (_, index) => collector.has(index + 1));
    error = null;
    if (result !== CollectResult.COMPLETE) return false;
    finishing = true;
    try {
      await onpayload(await collector.payload());
      return true;
    } catch (reason) {
      error = error_message(reason);
      collector.reset();
      got = 0;
      total = 0;
      have = [];
      return false;
    } finally {
      finishing = false;
    }
  }
</script>

<div class="flex w-full flex-col items-center gap-3">
  <div class="relative aspect-square w-full max-w-72 overflow-hidden rounded-lg bg-[light-dark(var(--background-lightest),var(--background-darker))] ring-1 ring-hairline">
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
  <div class="flex min-h-6 flex-col items-center gap-1.5" aria-live="polite">
    {#if total > 1}
      <div class="flex flex-wrap justify-center gap-1" aria-hidden="true">
        {#each have as done, index (index)}
          <span class={cn("size-2 rounded-full transition-colors", done ? "bg-primary" : "bg-foreground/20")}></span>
        {/each}
      </div>
      <p class="font-mono text-2xs text-foreground/80 tabular-nums">{got} of {total} codes</p>
    {:else if camera.active}
      <p class="text-ui text-foreground/65">Point the camera at the codes on the other phone.</p>
    {/if}
    {#if error}<p class="max-w-72 text-center text-ui text-error">{error}</p>{/if}
  </div>
</div>

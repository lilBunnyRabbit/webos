<script lang="ts">
  import { Button, IconButton, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import type { BarcodeDetector } from "$kit/utils/qr";
  import { CameraScan } from "$kit/utils/qr-scan.svelte";
  import { Camera as CameraIcon, CameraSlash as CameraSlashIcon, ImageSquare as ImageSquareIcon, QrCode as QrCodeIcon, X as XIcon } from "phosphor-svelte";

  interface Props {
    detector: () => Promise<BarcodeDetector>;
    /** `true` when the text was a Cards list and scanning can stop. */
    oncode: (text: string) => Promise<boolean>;
    onphoto: () => void;
    onclose: () => void;
    onerror: (title: string, reason: unknown) => void;
    /** Codes of a multi-part list so far, while one is coming in. */
    progress: { got: number; total: number } | null;
  }

  let { detector, oncode, onphoto, onclose, onerror, progress }: Props = $props();

  const { window: win } = get_app_context();

  const camera = new CameraScan({
    constraints: { facingMode: "environment" },
    detector: () => detector(),
    visible: () => win.is_visible,
    oncode: (text) => oncode(text),
    onerror: (reason) => onerror("Couldn't start the camera", reason),
  });

  function on_keydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !win.is_focused) return;
    event.stopPropagation();
    onclose();
  }
</script>

<svelte:document onkeydown={on_keydown} />

<section aria-label="Import from QR" class="absolute inset-0 z-20 flex animate-pop-in flex-col bg-background" tabindex="-1">
  <Toolbar>
    <IconButton size="sm" label="Close" onclick={onclose}><XIcon weight="bold" /></IconButton>
    <span class="min-w-0 flex-1 truncate text-ui font-medium">Import from QR</span>
  </Toolbar>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-md flex-col gap-4 p-4">
      {#if camera.active}
        <div class="relative overflow-hidden rounded-xl bg-background-darker">
          <video {@attach camera.preview} muted playsinline class="block aspect-square w-full object-cover"></video>
          <div class="pointer-events-none absolute inset-[15%] rounded-lg ring-2 ring-primary"></div>
        </div>
        {#if progress && progress.total > 1}
          <p class="text-center font-mono text-ui text-foreground/80 tabular-nums" aria-live="polite">{progress.got} of {progress.total} codes: hold steady</p>
        {:else}
          <p class="text-center text-ui text-foreground/65">Point the camera at a Cards QR code from another device.</p>
        {/if}
      {:else}
        <div class="flex flex-col items-center gap-2 py-6 text-center">
          <span class="grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary"><QrCodeIcon class="size-7" weight="duotone" /></span>
          <p class="text-sm font-medium">Scan a list or a shared card</p>
          <p class="max-w-xs text-ui text-foreground/65">On the other device, open Cards › More › Share list as QR, or a card's Share. You can also paste or drop a screenshot here.</p>
        </div>
      {/if}
    </div>
  </div>
  <div class="grid shrink-0 gap-2 border-t border-foreground/8 bg-background-light p-3 @md:grid-cols-2">
    {#if camera.active}
      <Button size="lg" onclick={() => camera.stop()}><CameraSlashIcon weight="bold" />Stop camera</Button>
    {:else}
      <Button size="lg" variant="primary" disabled={camera.starting} onclick={() => camera.start()}><CameraIcon weight="bold" />Scan with camera</Button>
    {/if}
    <Button size="lg" onclick={onphoto}><ImageSquareIcon weight="bold" />Scan a photo</Button>
  </div>
</section>

<script lang="ts">
  import { Button, EmptyState, Spinner } from "$lib/core/components/ui";
  import { QuadFrame } from "$kit/components/quad-frame";
  import { find_paper, to_gray, type Quad } from "$kit/utils/perspective";
  import { Scan as ScanIcon, Warning as WarningIcon } from "phosphor-svelte";
  import { upright } from "./photo";

  interface Props {
    image: Blob;
    /** `crop` is the list's corners in the photo's upright pixels, `null` for the whole photo. */
    onread: (crop: Quad | null) => void;
    oncancel: () => void;
  }

  let { image, onread, oncancel }: Props = $props();

  const DETECT_SIDE = 480;

  const url = $derived(URL.createObjectURL(image));
  $effect(() => {
    const current = url;
    return () => URL.revokeObjectURL(current);
  });

  let size = $state<{ width: number; height: number } | null>(null);
  let quad = $state<Quad | null>(null);
  let found = $state(false);
  let failed = $state(false);

  const whole = $derived<Quad | null>(
    size && [
      { x: 0, y: 0 },
      { x: size.width, y: 0 },
      { x: size.width, y: size.height },
      { x: 0, y: size.height },
    ]
  );
  const framed = $derived(quad !== null && whole !== null && quad.some((corner, index) => Math.hypot(corner.x - whole[index].x, corner.y - whole[index].y) > 2));

  async function find(source: Blob) {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await upright(source);
      const scale = Math.min(1, DETECT_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const paper = find_paper(to_gray(pixels.data, canvas.width, canvas.height));
      size = { width: bitmap.width, height: bitmap.height };
      found = paper !== null;
      quad = paper ? (paper.map((corner) => ({ x: corner.x / scale, y: corner.y / scale })) as Quad) : whole;
    } catch {
      size = null;
      failed = true;
    } finally {
      bitmap?.close();
    }
  }

  $effect(() => {
    void find(image);
  });
</script>

<section aria-label="Choose what to read" class="mx-auto flex h-full w-full max-w-xl flex-col">
  <div class="px-4 pt-4 pb-2">
    <p class="text-sm font-medium">Read the photo</p>
    <p class={["text-ui text-foreground/65", failed && "invisible"]}>
      {found ? "Found the list's paper; it's straightened before reading. Drag a corner if it's off." : "Read all of it, or drag the corners onto the list's paper to straighten it first."}
    </p>
  </div>
  <div class="relative min-h-0 flex-1">
    {#if size && quad}
      <QuadFrame
        bind:quad={() => quad!, (next) => (quad = next)}
        image={{ src: url, width: size.width, height: size.height }}
        alt="Your shopping list"
        labels={["Top left of the list", "Top right of the list", "Bottom right of the list", "Bottom left of the list"]}
        loupe
        class="absolute inset-0 p-6"
      />
    {:else if failed}
      <EmptyState icon={WarningIcon} tone="error" class="absolute inset-0" title="Couldn't open the photo" description="It may be damaged or in a format this browser can't read. Go back and pick another one." />
    {:else}
      <div class="absolute inset-0 grid place-items-center"><Spinner label="Opening the photo" /></div>
    {/if}
  </div>
  <div class="flex items-center justify-end gap-2 border-t border-foreground/8 bg-background-light px-4 py-3">
    <Button variant={failed ? "primary" : "quiet"} onclick={oncancel}>{failed ? "Back" : "Cancel"}</Button>
    {#if !failed}
      <Button variant={framed ? "secondary" : "primary"} disabled={!size} onclick={() => onread(null)}>Read all</Button>
    {/if}
    {#if framed}
      <Button variant="primary" onclick={() => quad && onread($state.snapshot(quad) as Quad)}><ScanIcon weight="bold" /> Read the list</Button>
    {/if}
  </div>
</section>

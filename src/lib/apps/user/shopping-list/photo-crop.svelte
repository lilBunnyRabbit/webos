<script lang="ts">
  import { Button, Spinner } from "$lib/core/components/ui";
  import type { Bounds, Dimensions } from "$lib/core/utils/type";
  import { CropFrame } from "$kit/components/crop-frame";
  import { Crop as CropIcon } from "phosphor-svelte";

  interface Props {
    image: Blob;
    /** `crop` is in the photo's upright pixels, `null` for the whole photo. */
    onread: (crop: Bounds | null) => void;
    oncancel: () => void;
  }

  let { image, onread, oncancel }: Props = $props();

  const url = $derived(URL.createObjectURL(image));
  $effect(() => {
    const current = url;
    return () => URL.revokeObjectURL(current);
  });

  let size = $state<Dimensions | null>(null);
  let rect = $state<Bounds>({ x: 0, y: 0, width: 1, height: 1 });

  const framed = $derived(size !== null && (rect.x > 0 || rect.y > 0 || rect.width < size.width || rect.height < size.height));

  function on_load(event: Event) {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget as HTMLImageElement;
    size = { width, height };
    rect = { x: 0, y: 0, width, height };
  }

  function read_framed() {
    onread({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) });
  }
</script>

<section aria-label="Choose what to read" class="mx-auto flex h-full w-full max-w-xl flex-col">
  <div class="px-4 pt-4 pb-2">
    <p class="text-sm font-medium">Read the photo</p>
    <p class="text-ui text-foreground/65">Read all of it, or drag the frame's corners around the list first.</p>
  </div>
  <div class="stage grid min-h-0 flex-1 place-items-center p-6">
    <div class="relative" style:aspect-ratio={size ? `${size.width} / ${size.height}` : undefined} style:width={size ? `min(100cqw, 100cqh * ${size.width / size.height})` : undefined}>
      <img src={url} alt="Your shopping list" class="block size-full rounded-sm select-none" draggable="false" onload={on_load} />
      {#if size}
        <CropFrame bind:rect bounds={size} label="Part to read" />
      {:else}
        <div class="absolute inset-0 grid place-items-center"><Spinner label="Opening the photo" /></div>
      {/if}
    </div>
  </div>
  <div class="flex items-center justify-end gap-2 border-t border-foreground/8 bg-background-light px-4 py-3">
    <Button variant="quiet" onclick={oncancel}>Cancel</Button>
    <Button variant={framed ? "secondary" : "primary"} disabled={!size} onclick={() => onread(null)}>Read all</Button>
    {#if framed}
      <Button variant="primary" onclick={read_framed}><CropIcon weight="bold" /> Read framed</Button>
    {/if}
  </div>
</section>

<style>
  .stage {
    container-type: size;
  }
</style>

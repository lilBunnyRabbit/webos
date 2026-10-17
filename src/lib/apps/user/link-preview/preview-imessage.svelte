<script lang="ts">
  import PreviewImage from "./preview-image.svelte";
  import { display_host, type CardProps } from "./preview-cards";

  const { meta }: CardProps = $props();
  const card = $derived(meta.derived);
  // iOS 16+ stitches several og:images into one composite instead of picking one.
  const images = $derived(meta.og_images.map((image) => image.secure_url ?? image.url));
  const touch_icon = $derived(meta.favicons.find((icon) => icon.rel.includes("apple-touch-icon"))?.href ?? null);
</script>

<div class="flex flex-col gap-2">
  <a href={meta.url} target="_blank" rel="noopener noreferrer" class="block w-full max-w-[17.5rem] overflow-hidden rounded-2xl bg-foreground/8 hover:opacity-85">
    {#if images.length > 1}
      <div class="grid aspect-square w-full gap-px bg-foreground/15" style:grid-template-columns="repeat({images.length}, minmax(0, 1fr))">
        {#each images as src, index (index)}<PreviewImage {src} class="size-full" />{/each}
      </div>
    {:else if card.image}
      <PreviewImage src={card.image} alt={card.image_alt} class="aspect-square w-full" />
    {/if}
    <div class="flex items-center gap-2.5 px-3 py-2.5">
      {#if !card.image && touch_icon}<PreviewImage src={touch_icon} class="size-10 shrink-0 rounded-md" />{/if}
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="line-clamp-2 text-ui font-semibold">{card.title ?? meta.url ?? "Untitled"}</span>
        {#if card.description}<span class="line-clamp-2 text-2xs text-foreground/65">{card.description}</span>{/if}
        <span class="truncate text-2xs text-foreground/65">{display_host(meta)}</span>
      </div>
    </div>
  </a>
  <p class="max-w-[17.5rem] text-2xs text-foreground/65">
    Approximate: Apple's crawler fetches with a Safari-like user agent, and a site may serve it different tags. The browser can't send that user agent, so this uses the same HTML as the other cards.
  </p>
</div>

<script lang="ts">
  import { cn } from "$lib/core/utils";
  import PreviewImage from "./preview-image.svelte";
  import { display_host, type CardProps } from "./preview-cards";

  const { meta }: CardProps = $props();
  const card = $derived(meta.derived);
  const image = $derived(card.twitter_image ?? card.image);
  const title = $derived(card.twitter_title ?? card.title);
  const description = $derived(card.twitter_description ?? card.description);
  const large = $derived(card.card === "summary_large_image");
</script>

<a
  href={meta.url}
  target="_blank"
  rel="noopener noreferrer"
  class={cn("flex max-w-[32rem] overflow-hidden rounded-2xl ring-1 ring-hairline-strong hover:opacity-85", large ? "flex-col" : "flex-row")}
>
  {#if image}
    <PreviewImage src={image} alt={card.image_alt} class={large ? "aspect-[1.91/1] w-full" : "aspect-square w-28 shrink-0"} />
  {/if}
  <div class={cn("flex min-w-0 flex-col justify-center gap-0.5 p-3", image && (large ? "border-t" : "border-l"), "border-hairline-strong")}>
    <span class="truncate text-2xs text-foreground/65">From {display_host(meta)}</span>
    {#if title}<span class="line-clamp-2 text-ui">{title}</span>{/if}
    {#if description && large}<span class="line-clamp-2 text-ui text-foreground/65">{description}</span>{/if}
  </div>
</a>

<script lang="ts">
  import PreviewImage from "./preview-image.svelte";
  import { display_host, wants_large_image, type CardProps } from "./preview-cards";

  const { meta }: CardProps = $props();
  const card = $derived(meta.derived);
  const large = $derived(wants_large_image(meta));
</script>

<!-- The stripe takes the page's own theme-color, the one value Discord shows from it: that's what is being previewed. -->
<div
  class="max-w-[32rem] overflow-hidden rounded-md border-l-4 border-foreground/20 bg-foreground/6"
  style:border-left-color={meta.theme_color ?? undefined}
>
  <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 py-3 pr-4 pl-3">
    <div class="flex min-w-0 flex-col gap-1.5">
      <span class="truncate text-2xs text-foreground/65">{card.site_name ?? display_host(meta)}</span>
      {#if card.title}
        <a href={meta.url} target="_blank" rel="noopener noreferrer" class="text-sm font-semibold text-primary hover:underline">{card.title}</a>
      {/if}
      {#if card.description}<p class="line-clamp-4 text-ui whitespace-pre-line">{card.description}</p>{/if}
    </div>
    {#if card.image && !large}
      <PreviewImage src={card.image} alt={card.image_alt} class="size-20 rounded-sm" />
    {/if}
    {#if card.image && large}
      <PreviewImage src={card.image} alt={card.image_alt} class="col-span-2 max-h-72 w-full rounded-sm" />
    {/if}
  </div>
</div>

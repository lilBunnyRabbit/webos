<script lang="ts">
  import PreviewImage from "./preview-image.svelte";
  import { display_host, type CardProps } from "./preview-cards";

  const { meta }: CardProps = $props();
  const card = $derived(meta.derived);
</script>

<a href={meta.url} target="_blank" rel="noopener noreferrer" class="block max-w-[32rem] overflow-hidden ring-1 ring-foreground/15 hover:opacity-85">
  {#if card.image}<PreviewImage src={card.image} alt={card.image_alt} class="aspect-[1.91/1] w-full" />{/if}
  <div class="flex flex-col gap-0.5 bg-foreground/6 px-3 py-2.5">
    <span class="truncate text-2xs text-foreground/65 uppercase">{display_host(meta)}</span>
    {#if card.title}<span class="line-clamp-2 text-sm font-semibold">{card.title}</span>{/if}
    {#if card.description}<span class="line-clamp-1 text-ui text-foreground/65">{card.description}</span>{/if}
  </div>
</a>

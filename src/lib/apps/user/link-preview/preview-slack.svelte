<script lang="ts">
  import PreviewImage from "./preview-image.svelte";
  import { display_host, wants_large_image, type CardProps } from "./preview-cards";

  const { meta }: CardProps = $props();
  const card = $derived(meta.derived);
  const icon = $derived(meta.favicons[0]?.href ?? null);
  let icon_failed = $state<string | null>(null);
</script>

<div class="flex max-w-[32rem] gap-3">
  <div class="w-1 shrink-0 rounded-full bg-foreground/20"></div>
  <div class="flex min-w-0 flex-col gap-1">
    <div class="flex min-w-0 items-center gap-1.5 text-2xs font-semibold">
      {#if icon && icon_failed !== icon}
        <img src={icon} alt="" referrerpolicy="no-referrer" class="size-4 shrink-0 object-contain" onerror={() => (icon_failed = icon)} />
      {/if}
      <span class="truncate">{card.site_name ?? display_host(meta)}</span>
    </div>
    {#if card.title}
      <a href={meta.url} target="_blank" rel="noopener noreferrer" class="text-ui font-semibold text-primary hover:underline">{card.title}</a>
    {/if}
    {#if card.description}<p class="line-clamp-3 text-ui whitespace-pre-line">{card.description}</p>{/if}
    {#if card.image}
      {#if wants_large_image(meta)}
        <PreviewImage src={card.image} alt={card.image_alt} class="mt-1 max-h-64 w-full max-w-[22rem] rounded-lg" />
      {:else}
        <PreviewImage src={card.image} alt={card.image_alt} class="mt-1 size-20 rounded-md" />
      {/if}
    {/if}
  </div>
</div>

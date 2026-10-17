<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { ImageBroken as ImageBrokenIcon } from "phosphor-svelte";

  interface Props {
    src: string | null;
    alt?: string | null;
    class?: string;
  }

  const { src, alt, class: class_name }: Props = $props();

  let failed = $state<string | null>(null);
</script>

{#if src && failed !== src}
  <img {src} alt={alt ?? ""} referrerpolicy="no-referrer" loading="lazy" class={cn("object-cover", class_name)} onerror={() => (failed = src)} />
{:else}
  <div role="img" aria-label={src ? "Image didn't load" : "No image"} class={cn("grid place-items-center bg-foreground/8 text-foreground/35", class_name)}>
    <ImageBrokenIcon class="size-6" />
  </div>
{/if}

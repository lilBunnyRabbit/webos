<script lang="ts">
  import { cn } from "$lib/core/utils";

  let { blob, alt, class: class_name }: { blob: Blob; alt: string; class?: string } = $props();

  const url = $derived(URL.createObjectURL(blob));
  $effect(() => {
    const current = url;
    return () => URL.revokeObjectURL(current);
  });
</script>

<img src={url} {alt} class={cn("block rounded-lg bg-background-darker object-contain", class_name)} />

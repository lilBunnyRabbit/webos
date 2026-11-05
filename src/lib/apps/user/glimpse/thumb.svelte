<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { read_thumb } from "./store";

  let { id, class: class_name }: { id: string; class?: string } = $props();

  const files = $derived(kernel.service<FilesService>("files"));
  let url = $state<string | null>(null);

  $effect(() => {
    let alive = true;
    let made: string | null = null;
    read_thumb(files, id)
      .then((file) => {
        if (!alive || !file) return;
        made = URL.createObjectURL(file);
        url = made;
      })
      .catch((reason: unknown) => console.warn("[Glimpse] thumbnail failed", reason));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
      url = null;
    };
  });
</script>

{#if url}
  <img src={url} alt="" draggable="false" class={cn("size-full object-cover", class_name)} />
{:else}
  <span class={cn("block size-full bg-foreground/8", class_name)}></span>
{/if}

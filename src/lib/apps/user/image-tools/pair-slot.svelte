<script lang="ts">
  import { IconButton, Spinner } from "$lib/core/components/ui";
  import { Devices as DevicesIcon, FolderOpen as FolderOpenIcon } from "phosphor-svelte";
  import type { ImagePair, Slot } from "./pair.svelte";

  interface Props {
    pair: ImagePair;
    slot: Slot;
    label: string;
  }

  const { pair, slot, label }: Props = $props();
  const image = $derived(pair.images[slot]);
</script>

<div class="flex h-9 items-center gap-1 rounded-md pl-2 hover:bg-foreground/6">
  <span class="w-14 shrink-0 text-2xs font-medium text-foreground/65">{label}</span>
  {#if pair.loading[slot]}
    <span class="flex-1"><Spinner label="Loading {label.toLowerCase()}" /></span>
  {:else if image}
    <span class="min-w-0 flex-1 truncate text-ui" title={image.path ?? image.name}>{image.name}</span>
    <span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{image.bitmap.width}×{image.bitmap.height}</span>
  {:else}
    <span class="min-w-0 flex-1 truncate text-ui text-foreground/65">None</span>
  {/if}
  <IconButton label="Open {label.toLowerCase()}…" size="sm" onclick={() => pair.pick(slot)}><FolderOpenIcon weight="bold" /></IconButton>
  <IconButton label="Open {label.toLowerCase()} from device…" size="sm" onclick={() => pair.pick_device(slot)}><DevicesIcon weight="bold" /></IconButton>
</div>

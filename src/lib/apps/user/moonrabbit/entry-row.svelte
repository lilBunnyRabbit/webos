<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { Image as ImageIcon } from "phosphor-svelte";
  import { MOOD_ICONS } from "./icons";
  import type { IndexEntry } from "./journal";
  import { MOOD_LABELS, mood_level } from "./mood";

  interface Props {
    meta: IndexEntry;
    selected?: boolean;
    /** Shown instead of the time, for lists that span days. */
    when?: string;
    onopen: (meta: IndexEntry) => void;
  }

  let { meta, selected = false, when, onopen }: Props = $props();

  const mood = $derived(meta.mood ? mood_level(meta.mood) : null);

  function time_of(at: number): string {
    return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  }
</script>

<button
  type="button"
  class={cn(
    "grid w-full grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0.5 rounded-md px-2.5 py-2 text-left hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none pointer-coarse:py-2.5",
    selected && "bg-primary/14 hover:bg-primary/14"
  )}
  onclick={() => onopen(meta)}
>
  <span class="line-clamp-2 text-ui">{meta.title}</span>
  {#if mood}
    {@const Icon = MOOD_ICONS[mood]}
    <Icon class="row-span-2 size-5 text-foreground/80" aria-label={MOOD_LABELS[mood]} role="img" />
  {:else}
    <span class="row-span-2"></span>
  {/if}
  <span class="flex min-w-0 items-center gap-2 font-mono text-2xs text-foreground/80 tabular-nums">
    <span>{when ?? time_of(meta.created)}</span>
    {#if meta.words}<span>{meta.words} {meta.words === 1 ? "word" : "words"}</span>{/if}
    {#if meta.media.length}<span class="flex items-center gap-0.5"><ImageIcon class="size-3" />{meta.media.length}</span>{/if}
    {#each meta.tags.slice(0, 3) as tag (tag)}<span class="truncate text-primary">#{tag}</span>{/each}
  </span>
</button>

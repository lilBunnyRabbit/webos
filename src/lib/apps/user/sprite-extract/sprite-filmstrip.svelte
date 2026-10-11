<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { X as XIcon } from "phosphor-svelte";
  import SpriteFrameThumb from "./sprite-frame-thumb.svelte";
  import type { SpriteExtractState } from "./sprite-extract.svelte";

  const THUMB = 44;

  let { sprite }: { sprite: SpriteExtractState } = $props();

  let drag_from = $state<number | null>(null);
  let drop_at = $state<number | null>(null);

  function finish() {
    drag_from = null;
    drop_at = null;
  }
</script>

{#if sprite.source}
  {@const image = sprite.source.image}
  {#if sprite.sequence.length}
    <ul class="flex flex-wrap content-start gap-1" aria-label="Sequence">
      {#each sprite.sequence as index, position (`${position}-${index}`)}
        {@const rect = sprite.grid.frames[index]}
        {#if rect}
          <li
            draggable="true"
            class={cn(
              "group relative cursor-grab rounded-sm bg-background-darker ring-2 select-none active:cursor-grabbing",
              index === sprite.selected ? "ring-foreground" : "ring-foreground/20 hover:ring-foreground/50",
              drop_at === position && drag_from !== null && drag_from !== position && "ring-primary",
              drag_from === position && "opacity-38"
            )}
            ondragstart={(event) => {
              drag_from = position;
              if (!event.dataTransfer) return;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(position));
            }}
            ondragover={(event) => {
              if (drag_from === null) return;
              event.preventDefault();
              if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
              drop_at = position;
            }}
            ondrop={(event) => {
              if (drag_from === null) return;
              event.preventDefault();
              sprite.move_sequence_item(drag_from, position);
              finish();
            }}
            ondragend={finish}
          >
            <button
              type="button"
              class="block p-0.5"
              title="Position {position + 1} · frame #{index}. Click to select, drag to reorder"
              onclick={() => (sprite.selected = index)}
            >
              <SpriteFrameThumb {image} {rect} size={THUMB} />
            </button>
            <span class="pointer-events-none absolute top-0 left-0 rounded-br-sm bg-background/80 px-1 font-mono text-2xs leading-3">{index}</span>
            <span class="pointer-events-none absolute right-0 bottom-0 rounded-tl-sm bg-background/80 px-1 font-mono text-2xs leading-3 text-foreground/65">{position + 1}</span>
            <button
              type="button"
              aria-label="Remove from sequence"
              title="Remove from sequence"
              class="absolute -top-1 -right-1 hidden size-4 place-items-center rounded-full bg-error text-background group-focus-within:grid group-hover:grid"
              onclick={() => sprite.remove_sequence_at(position)}
            >
              <XIcon class="size-2.5" weight="bold" />
            </button>
          </li>
        {/if}
      {/each}
    </ul>
  {:else}
    <p class="text-ui text-foreground/65">The sequence is empty. Double-click frames on the sheet to add them.</p>
  {/if}
{/if}

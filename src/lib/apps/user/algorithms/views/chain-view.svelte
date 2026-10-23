<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { pointers_at, type ChainView } from "../engine/step";
  import { TONE_TEXT, TONE_TINT } from "./tones";

  let { view }: { view: ChainView } = $props();

  const labels = $derived(pointers_at(view.pointers));
</script>

<div class="flex flex-wrap items-end gap-y-3">
  {#if view.items.length === 0}
    <span class="rounded-md px-2.5 py-1.5 font-mono text-ui text-foreground/65 ring-1 ring-hairline ring-inset">empty</span>
  {/if}
  {#each view.items as item, index (index)}
    <div class="flex items-end">
      <div class="flex flex-col items-center gap-0.5">
        <span class="flex h-4 gap-1 font-mono text-2xs leading-4">
          {#each labels.get(index) ?? [] as pointer (pointer.label)}
            <span class={pointer.tone ? TONE_TEXT[pointer.tone] : "text-foreground/80"}>{pointer.label}</span>
          {/each}
        </span>
        <span
          class={cn(
            "grid min-h-9 min-w-10 place-items-center rounded-md px-2 font-mono text-ui tabular-nums ring-1 transition-colors duration-150 ring-inset",
            item.tone ? TONE_TINT[item.tone] : "bg-background-light ring-hairline-strong"
          )}>{item.text}</span
        >
      </div>
      {#if index < view.items.length - 1}
        <span class="mb-2 w-7 text-center text-foreground/45" aria-hidden="true">{view.double ? "⇄" : "→"}</span>
      {/if}
    </div>
  {/each}
  {#if view.items.length}
    <span class="mb-2 ml-1 font-mono text-2xs text-foreground/45">→ null</span>
  {/if}
</div>

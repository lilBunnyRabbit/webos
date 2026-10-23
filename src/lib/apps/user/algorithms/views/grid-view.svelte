<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GridView } from "../engine/step";
  import { TONE_BG, TONE_TEXT, TONE_TINT } from "./tones";

  let { view }: { view: GridView } = $props();

  const columns = $derived(Math.max(1, ...view.rows.map((row) => row.length), view.col_labels?.length ?? 0));
  const pointed = $derived(new Map((view.pointers ?? []).map((pointer) => [pointer.index, pointer])));
  const labelled = $derived(Boolean(view.row_labels?.length));
</script>

<div class={cn("max-w-full pb-1", view.board ? "mx-auto w-full" : "overflow-x-auto overscroll-x-contain")} style:max-width={view.board ? `min(100%, ${columns * 2.25}rem, 34rem)` : undefined}>
  <div
    class={cn("grid", view.board ? "w-full gap-0 ring-1 ring-hairline-strong" : "w-max gap-1")}
    style:grid-template-columns="{labelled ? "auto " : ""}repeat({columns}, {view.board ? "minmax(0, 1fr)" : "minmax(2rem, auto)"})"
  >
    {#if view.pointers?.length}
      {#if labelled}<span></span>{/if}
      {#each Array.from({ length: columns }) as _, index (index)}
        {@const pointer = pointed.get(index)}
        <span class={cn("h-4 text-center font-mono text-2xs leading-4 whitespace-nowrap", pointer?.tone ? TONE_TEXT[pointer.tone] : "text-foreground/80")}>{pointer ? `${pointer.label}↓` : ""}</span>
      {/each}
    {/if}
    {#if view.col_labels?.length}
      {#if labelled}<span></span>{/if}
      {#each Array.from({ length: columns }) as _, index (index)}
        <span class="text-center font-mono text-2xs text-foreground/65 tabular-nums">{view.col_labels[index] ?? ""}</span>
      {/each}
    {/if}
    {#each view.rows as row, r (r)}
      {#if labelled}
        <span class="self-center pr-1.5 text-right font-mono text-2xs whitespace-nowrap text-foreground/65">{view.row_labels?.[r] ?? ""}</span>
      {/if}
      {#each Array.from({ length: columns }) as _, c (c)}
        {@const cell = row[c]}
        {#if cell}
          <span
            class={cn(
              "grid min-h-8 place-items-center px-1.5 font-mono text-ui tabular-nums whitespace-nowrap ring-1 transition-colors duration-150 ring-inset",
              view.board ? "aspect-square min-h-0 px-0 text-[clamp(0.7rem,3cqw,1.05rem)]" : "rounded-md",
              cell.tone && view.board && cell.tone !== "muted" ? `${TONE_BG[cell.tone]} text-background ring-background/20` : cell.tone ? TONE_TINT[cell.tone] : view.board ? "bg-background-light ring-hairline" : "bg-background-light ring-hairline"
            )}>{cell.text}</span
          >
        {:else}
          <span></span>
        {/if}
      {/each}
    {/each}
  </div>
</div>

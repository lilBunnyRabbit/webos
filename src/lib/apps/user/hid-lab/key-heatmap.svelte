<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { block_codes, cap_label, heat, MAIN_BLOCK, NAV_BLOCK, NAV_CODES, NUMPAD_BLOCK, NUMPAD_CODES, type KeyRow, type Shape } from "./keys";

  interface Props {
    shape: Shape;
    presses: ReadonlyMap<string, number>;
    held: ReadonlyMap<string, unknown>;
    layout: ReadonlyMap<string, string> | null;
    mac: boolean;
  }

  const { shape, presses, held, layout, mac }: Props = $props();

  const FILL = [
    "bg-raised text-foreground/65",
    "bg-primary/20 text-foreground",
    "bg-primary/40 text-foreground",
    "bg-primary/65 text-foreground",
    "bg-primary text-background",
  ] as const;

  const main_codes = $derived(block_codes(MAIN_BLOCK[shape]));
  // Nav and numpad blocks only fit wide windows; until they show, their keys are listed as chips instead.
  const others = $derived([...presses.keys()].filter((code) => !main_codes.has(code)).sort());

  const in_side_blocks = (code: string) => NAV_CODES.has(code) || NUMPAD_CODES.has(code);
</script>

{#snippet block(rows: KeyRow[], units: number, class_name = "")}
  <div class={cn("flex min-w-0 flex-col gap-0.5 @md:gap-1", class_name)} style:flex="{units} {units} 0">
    {#each rows as row, index (index)}
      <div class="grid gap-0.5 @md:gap-1" style:grid-template-columns="repeat({units * 4}, minmax(0, 1fr))">
        {#each row as cap, column (column)}
          {#if cap.code}
            {@const count = presses.get(cap.code) ?? 0}
            <div
              class={cn(
                "grid h-7 min-w-0 place-items-center overflow-hidden rounded-sm px-0.5 text-2xs font-medium transition-[background-color,box-shadow] duration-150 @md:h-8",
                FILL[heat(count)],
                held.has(cap.code) ? "shadow-pressed outline-2 outline-offset-1 outline-cottontail" : "shadow-control"
              )}
              style:grid-column="span {cap.width * 4}"
              title="{cap.code}: {count === 0 ? 'not tested' : `${count}×`}"
            >
              <span class="truncate">{cap_label(cap.code, layout, mac)}</span>
            </div>
          {:else}
            <div class="h-7 @md:h-8" style:grid-column="span {cap.width * 4}"></div>
          {/if}
        {/each}
      </div>
    {/each}
  </div>
{/snippet}

<div class="flex flex-col gap-3">
  <div class="flex gap-3" role="img" aria-label="Keyboard heatmap: {presses.size} keys tested">
    {@render block(MAIN_BLOCK[shape], 15)}
    {@render block(NAV_BLOCK, 3, "hidden @3xl:flex")}
    {@render block(NUMPAD_BLOCK, 4, "hidden @3xl:flex")}
  </div>
  {#if others.length}
    <div class={cn("flex flex-wrap items-center gap-1.5 text-ui", others.every(in_side_blocks) && "@3xl:hidden")}>
      <span class="text-foreground/65">Also tested</span>
      {#each others as code (code)}
        <span class={cn("rounded-sm px-1.5 py-0.5 font-mono text-2xs", in_side_blocks(code) && "@3xl:hidden", FILL[heat(presses.get(code) ?? 0)], held.has(code) && "outline-2 outline-cottontail")}>
          {code}
        </span>
      {/each}
    </div>
  {/if}
</div>

<script lang="ts">
  import { Button, Input, Select } from "$lib/core/components/ui";
  import { FilePlus as FilePlusIcon } from "phosphor-svelte";
  import { clamp_side, MAX_SIDE } from "./model";
  import { DEFAULT_PRESET, PALETTE_PRESETS } from "./palettes";

  interface Props {
    id: string;
    anchor: string;
    oncreate: (width: number, height: number, preset: string) => void;
  }

  let { id, anchor, oncreate }: Props = $props();

  let popover = $state<HTMLElement>();
  let width = $state<number | null>(32);
  let height = $state<number | null>(32);
  let preset = $state(DEFAULT_PRESET.id);

  const SIZES = [16, 32, 48, 64, 128];

  function create() {
    oncreate(clamp_side(width ?? 32), clamp_side(height ?? 32), preset);
    popover?.hidePopover();
  }
</script>

<div bind:this={popover} {id} popover="auto" class="hs-popover m-0 w-72 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover" style="position-anchor: {anchor}">
  <form class="flex flex-col gap-3" onsubmit={(event) => (event.preventDefault(), create())}>
    <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">New sprite</p>
    <div class="flex flex-wrap gap-1">
      {#each SIZES as size (size)}
        <Button
          size="sm"
          variant="quiet"
          pressed={width === size && height === size}
          class="font-mono text-2xs tabular-nums"
          onclick={() => ((width = size), (height = size))}
        >
          {size}²
        </Button>
      {/each}
    </div>
    <div class="flex items-center gap-2">
      <Input type="number" size="sm" min={1} max={MAX_SIDE} bind:value={width} aria-label="Width" class="font-mono tabular-nums" />
      <span class="text-foreground/65">×</span>
      <Input type="number" size="sm" min={1} max={MAX_SIDE} bind:value={height} aria-label="Height" class="font-mono tabular-nums" />
      <span class="text-2xs text-foreground/65">px</span>
    </div>
    <label class="flex flex-col gap-1 text-2xs text-foreground/65">
      Palette
      <Select size="sm" options={PALETTE_PRESETS.map((item) => ({ value: item.id, label: `${item.name} · ${item.colors.length}` }))} bind:value={preset} />
    </label>
    <div class="flex justify-end">
      <Button size="sm" variant="primary" type="submit"><FilePlusIcon weight="bold" /> Create</Button>
    </div>
  </form>
</div>

<style>
  .hs-popover {
    position-area: bottom span-right;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }
</style>

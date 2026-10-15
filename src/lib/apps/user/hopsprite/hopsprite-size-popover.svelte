<script lang="ts">
  import { Button, Checkbox, Input, Segmented } from "$lib/core/components/ui";
  import { ArrowsOut as ArrowsOutIcon, Resize as ResizeIcon } from "phosphor-svelte";
  import { resize_sprite, scale_sprite } from "./document";
  import type { Editor } from "./editor.svelte";
  import { clamp_side, MAX_SIDE } from "./model";

  interface Props {
    id: string;
    anchor: string;
    editor: Editor;
  }

  let { id, anchor, editor }: Props = $props();

  let popover = $state<HTMLElement>();
  let mode = $state<"canvas" | "scale">("canvas");
  let width = $state<number | null>(32);
  let height = $state<number | null>(32);
  let lock = $state(true);
  let anchor_x = $state(0.5);
  let anchor_y = $state(0.5);

  const sprite = $derived(editor.sprite);

  function sync() {
    width = sprite.width;
    height = sprite.height;
  }

  function set_width(value: number | null) {
    width = value;
    if (mode === "scale" && lock && value) height = clamp_side((value * sprite.height) / sprite.width);
  }

  function set_height(value: number | null) {
    height = value;
    if (mode === "scale" && lock && value) width = clamp_side((value * sprite.width) / sprite.height);
  }

  function factor(value: number) {
    width = clamp_side(sprite.width * value);
    height = clamp_side(sprite.height * value);
  }

  function apply() {
    const w = clamp_side(width ?? sprite.width);
    const h = clamp_side(height ?? sprite.height);
    if (w !== sprite.width || h !== sprite.height) {
      editor.apply((value) => (mode === "canvas" ? resize_sprite(value, w, h, anchor_x, anchor_y) : scale_sprite(value, w, h)));
      editor.selection = null;
    }
    popover?.hidePopover();
  }

  const ANCHORS = [0, 0.5, 1];
</script>

<div
  bind:this={popover}
  {id}
  popover="auto"
  class="hs-popover m-0 w-72 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
  style="position-anchor: {anchor}"
  ontoggle={(event) => event.newState === "open" && sync()}
>
  <form class="flex flex-col gap-3" onsubmit={(event) => (event.preventDefault(), apply())}>
    <div class="flex items-center justify-between gap-2">
      <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Sprite size</p>
      <span class="font-mono text-2xs text-foreground/65 tabular-nums">{sprite.width} × {sprite.height}</span>
    </div>
    <Segmented
      size="sm"
      label="Resize mode"
      options={[
        { value: "canvas", label: "Canvas" },
        { value: "scale", label: "Scale" },
      ]}
      bind:value={mode}
    />
    <div class="flex items-center gap-2">
      <Input type="number" size="sm" min={1} max={MAX_SIDE} bind:value={() => width, set_width} aria-label="Width" class="font-mono tabular-nums" />
      <span class="text-foreground/65">×</span>
      <Input type="number" size="sm" min={1} max={MAX_SIDE} bind:value={() => height, set_height} aria-label="Height" class="font-mono tabular-nums" />
    </div>
    {#if mode === "canvas"}
      <div class="flex items-center gap-3">
        <div class="anchor grid grid-cols-3 gap-1" role="radiogroup" aria-label="Anchor">
          {#each ANCHORS as y (y)}
            {#each ANCHORS as x (x)}
              <button
                type="button"
                role="radio"
                aria-checked={anchor_x === x && anchor_y === y}
                aria-label="Anchor {y === 0 ? 'top' : y === 1 ? 'bottom' : 'middle'} {x === 0 ? 'left' : x === 1 ? 'right' : 'centre'}"
                class={["size-6 rounded-xs transition-colors", anchor_x === x && anchor_y === y ? "bg-primary" : "bg-foreground/10 hover:bg-foreground/20"]}
                onclick={() => ((anchor_x = x), (anchor_y = y))}
              ></button>
            {/each}
          {/each}
        </div>
        <p class="text-2xs text-foreground/65">Where the art stays when the canvas grows or shrinks. Pixels outside are cut off.</p>
      </div>
    {:else}
      <div class="flex flex-wrap items-center gap-1">
        {#each [0.5, 2, 3, 4] as value (value)}
          <Button size="sm" variant="quiet" class="font-mono text-2xs" onclick={() => factor(value)}>{value === 0.5 ? "½" : `${value}×`}</Button>
        {/each}
        <label class="ml-auto flex items-center gap-1.5 text-ui text-foreground/80"><Checkbox bind:checked={lock} /> Keep ratio</label>
      </div>
    {/if}
    <div class="flex justify-end">
      <Button size="sm" variant="primary" type="submit">
        {#if mode === "canvas"}<ResizeIcon weight="bold" /> Resize canvas{:else}<ArrowsOutIcon weight="bold" /> Scale sprite{/if}
      </Button>
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

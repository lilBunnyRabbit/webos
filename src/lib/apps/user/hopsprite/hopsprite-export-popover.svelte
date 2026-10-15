<script lang="ts">
  import { Button, Segmented, Select, Switch } from "$lib/core/components/ui";
  import { Export as ExportIcon } from "phosphor-svelte";
  import type { Editor } from "./editor.svelte";
  import { Direction, DIRECTIONS } from "./model";
  import { frame_sequence } from "./sequence";
  import type { AnimationExport } from "./export";

  export type ExportRequest = { kind: "frame"; scale: number } | ({ kind: "animation" } & AnimationExport);

  interface Props {
    id: string;
    anchor: string;
    editor: Editor;
    onexport: (request: ExportRequest) => void;
  }

  let { id, anchor, editor, onexport }: Props = $props();

  let popover = $state<HTMLElement>();
  let kind = $state<"frame" | "animation">("animation");
  let scale = $state("4");
  let range = $state("-1");
  let direction = $state<Direction>(Direction.FORWARD);
  let loop = $state(true);

  const sprite = $derived(editor.sprite);
  const tag = $derived(Number(range) >= 0 ? sprite.tags[Number(range)] : undefined);
  const frames = $derived(tag ? { from: tag.from, to: tag.to } : { from: 0, to: sprite.frames.length - 1 });
  const order = $derived(frame_sequence(frames, direction));
  const total = $derived(order.reduce((sum, frame) => sum + (sprite.frames[frame]?.duration ?? 0), 0));
  const factor = $derived(Number(scale));

  const DIRECTION_LABELS: Record<Direction, string> = { forward: "Forward", reverse: "Reverse", pingpong: "Ping-pong" };

  function pick_range(value: string) {
    range = value;
    const picked = Number(value) >= 0 ? sprite.tags[Number(value)] : undefined;
    if (picked) direction = picked.direction;
  }

  function submit() {
    popover?.hidePopover();
    if (kind === "frame") onexport({ kind, scale: factor });
    else onexport({ kind, scale: factor, range: frames, direction, loop });
  }

  function sync() {
    if (sprite.frames.length === 1) kind = "frame";
    if (Number(range) >= sprite.tags.length) range = "-1";
  }
</script>

<div
  bind:this={popover}
  {id}
  popover="auto"
  class="hs-popover m-0 w-76 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
  style="position-anchor: {anchor}"
  ontoggle={(event) => event.newState === "open" && sync()}
>
  <form class="flex flex-col gap-3" onsubmit={(event) => (event.preventDefault(), submit())}>
    <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Export SVG</p>
    <Segmented
      size="sm"
      label="What to export"
      options={[
        { value: "frame", label: "This frame" },
        { value: "animation", label: "Animation" },
      ]}
      bind:value={kind}
    />
    <label class="flex items-center justify-between gap-3 text-ui">
      Scale
      <Select size="sm" class="w-36" options={[1, 2, 4, 8, 16].map((value) => ({ value: String(value), label: `${value}× · ${sprite.width * value}×${sprite.height * value}` }))} bind:value={scale} />
    </label>
    {#if kind === "animation"}
      {#if sprite.tags.length}
        <label class="flex items-center justify-between gap-3 text-ui">
          Frames
          <Select
            size="sm"
            class="w-36"
            options={[{ value: "-1", label: "All frames" }, ...sprite.tags.map((item, i) => ({ value: String(i), label: item.name }))]}
            bind:value={() => range, pick_range}
          />
        </label>
      {/if}
      <label class="flex items-center justify-between gap-3 text-ui">
        Direction
        <Select size="sm" class="w-36" options={DIRECTIONS.map((value) => ({ value, label: DIRECTION_LABELS[value] }))} bind:value={direction} />
      </label>
      <label class="flex items-center justify-between gap-3 text-ui">
        Loop forever
        <Switch bind:checked={loop} />
      </label>
      <p class="font-mono text-2xs text-foreground/65 tabular-nums">{order.length} frames · {(total / 1000).toFixed(2)} s · plays anywhere SVG does</p>
    {:else}
      <p class="font-mono text-2xs text-foreground/65 tabular-nums">Frame {editor.frame + 1} · vector, one path per colour</p>
    {/if}
    <div class="flex justify-end">
      <Button size="sm" variant="primary" type="submit"><ExportIcon weight="bold" /> Export…</Button>
    </div>
  </form>
</div>

<style>
  .hs-popover {
    position-area: bottom span-left;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }
</style>

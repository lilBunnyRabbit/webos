<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import { Button, Input, Segmented, Select, Slider, Switch } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { PencilSimple as PencilSimpleIcon, Play as PlayIcon, Tag as TagIcon, Trash as TrashIcon } from "phosphor-svelte";
  import * as doc from "./document";
  import type { Editor } from "./editor.svelte";
  import { below } from "./menu";
  import { Direction } from "./model";
  import type { Onion } from "./prefs";
  import { PlayMode } from "./sequence";

  interface Props {
    id: string;
    anchor: string;
    editor: Editor;
    playing: boolean;
    mode: { value: PlayMode };
    range: { value: number };
    onion: { value: Onion };
    selected: { from: number; to: number };
    ontag: () => void;
    ontoggleplay: () => void;
  }

  let { id, anchor, editor, playing, mode, range, onion, selected, ontag, ontoggleplay }: Props = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const { window: win } = get_app_context();

  const sprite = $derived(editor.sprite);
  const indices = $derived(Array.from({ length: selected.to - selected.from + 1 }, (_, i) => selected.from + i));
  const many = $derived(indices.length > 1);
  const total = $derived(sprite.frames.reduce((sum, frame) => sum + frame.duration, 0));

  const DIRECTION_LABELS: Record<Direction, string> = { forward: "Forward", reverse: "Reverse", pingpong: "Ping-pong" };

  let duration = $state<number | null>(100);

  function sync() {
    duration = sprite.frames[editor.frame]?.duration ?? 100;
  }

  function set_duration() {
    const value = Number(duration);
    if (!Number.isFinite(value) || value < 1) return sync();
    editor.apply((value_sprite) => doc.set_durations(value_sprite, indices, Math.round(value)));
  }

  function set_fps(fps: number) {
    duration = Math.round(1000 / fps);
    set_duration();
  }

  function update_onion(patch: Partial<Onion>) {
    onion.value = { ...onion.value, ...patch };
  }

  async function tag_menu(index: number, event: MouseEvent) {
    event.preventDefault();
    const tag = sprite.tags[index];
    const choice = await dialogs.menu(
      [
        { id: "play", label: "Play this tag", icon: PlayIcon },
        { id: "rename", label: "Rename…", icon: PencilSimpleIcon },
        {
          label: "Direction",
          items: Object.values(Direction).map((direction) => ({
            id: `direction:${direction}`,
            label: `${DIRECTION_LABELS[direction]}${tag.direction === direction ? " ✓" : ""}`,
          })),
        },
        { separator: true },
        { id: "delete", label: "Delete tag", icon: TrashIcon, danger: true },
      ],
      { anchor: below(event) }
    );
    if (!choice) return;
    if (choice === "play") {
      range.value = index;
      editor.set_frame(tag.direction === Direction.REVERSE ? tag.to : tag.from);
      if (!playing) ontoggleplay();
    } else if (choice === "rename") {
      const name = await win.prompt("Tag name", { initial: tag.name, confirm_label: "Rename" });
      if (name?.trim()) editor.apply((value) => doc.update_tag(value, index, { name: name.trim() }));
    } else if (choice.startsWith("direction:")) {
      editor.apply((value) => doc.update_tag(value, index, { direction: choice.slice(10) as Direction }));
    } else if (choice === "delete") {
      if (range.value === index) range.value = -1;
      else if (range.value > index) range.value--;
      editor.apply((value) => doc.remove_tag(value, index));
    }
  }

  const range_options = $derived([{ value: "-1", label: "All frames" }, ...sprite.tags.map((tag, i) => ({ value: String(i), label: tag.name }))]);
</script>

<div
  {id}
  popover="auto"
  class="hs-popover m-0 max-h-[min(34rem,80cqh)] w-76 overflow-y-auto rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
  style="position-anchor: {anchor}"
  ontoggle={(event) => event.newState === "open" && sync()}
>
  <div class="flex flex-col gap-3">
    <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Timing</p>
    <label class="flex items-center justify-between gap-3 text-ui">
      {many ? `Frames ${selected.from + 1}–${selected.to + 1}` : `Frame ${editor.frame + 1}`}
      <span class="flex items-center gap-1.5 text-2xs text-foreground/65">
        <Input type="number" size="sm" min={1} max={65535} class="w-20 font-mono tabular-nums" aria-label="Duration in milliseconds" bind:value={duration} onchange={set_duration} />
        ms
      </span>
    </label>
    <div class="flex items-center justify-between gap-2">
      <span class="text-2xs text-foreground/65">Speed</span>
      <div class="flex gap-1">
        {#each [8, 10, 12, 24] as fps (fps)}
          <Button size="sm" variant="quiet" class="font-mono text-2xs tabular-nums" pressed={duration === Math.round(1000 / fps)} onclick={() => set_fps(fps)}>{fps} fps</Button>
        {/each}
      </div>
    </div>
    <Segmented
      size="sm"
      label="Playback"
      class="[&>label]:flex-1 [&>label]:justify-center"
      options={[
        { value: PlayMode.LOOP, label: "Loop" },
        { value: PlayMode.PINGPONG, label: "Ping-pong" },
        { value: PlayMode.ONCE, label: "Once" },
      ]}
      bind:value={mode.value}
    />
    <p class="font-mono text-2xs text-foreground/80 tabular-nums">{sprite.frames.length} frames · {(total / 1000).toFixed(2)} s</p>

    <div class="flex items-center justify-between gap-2 border-t border-foreground/8 pt-3">
      <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Tags</p>
      <Button size="sm" variant="quiet" onclick={ontag}><TagIcon weight="bold" />{many ? `Tag ${indices.length} frames` : "Tag frame"}</Button>
    </div>
    {#if sprite.tags.length}
      <div class="flex flex-wrap gap-1">
        {#each sprite.tags as tag, i (i)}
          <button type="button" class={["tag rounded-sm px-2 py-0.5 text-2xs", range.value === i && "active"]} title="Frames {tag.from + 1}–{tag.to + 1} · {DIRECTION_LABELS[tag.direction]}" onclick={(event) => tag_menu(i, event)}>
            {tag.name} <span class="font-mono text-foreground/65">{tag.from + 1}–{tag.to + 1}</span>
          </button>
        {/each}
      </div>
      <label class="flex items-center justify-between gap-3 text-ui">
        Play
        <Select size="sm" class="w-36" aria-label="Play range" options={range_options} bind:value={() => String(range.value), (value) => (range.value = Number(value))} />
      </label>
    {:else}
      <p class="text-2xs text-foreground/80">Shift-click frames to pick a range, then tag it to play or export just that part.</p>
    {/if}

    <div class="flex items-center justify-between gap-3 border-t border-foreground/8 pt-3">
      <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Onion skin</p>
      <Switch checked={onion.value.enabled} aria-label="Show onion skin" onchange={(event) => update_onion({ enabled: event.currentTarget.checked })} />
    </div>
    <label class="flex items-center gap-2 text-ui">
      <span class="w-14">Before</span>
      <Slider size="sm" min={0} max={4} class="flex-1" value={onion.value.before} oninput={(event) => update_onion({ before: Number(event.currentTarget.value) })} />
      <span class="w-6 text-right font-mono text-2xs tabular-nums">{onion.value.before}</span>
    </label>
    <label class="flex items-center gap-2 text-ui">
      <span class="w-14">After</span>
      <Slider size="sm" min={0} max={4} class="flex-1" value={onion.value.after} oninput={(event) => update_onion({ after: Number(event.currentTarget.value) })} />
      <span class="w-6 text-right font-mono text-2xs tabular-nums">{onion.value.after}</span>
    </label>
    <label class="flex items-center gap-2 text-ui">
      <span class="w-14">Opacity</span>
      <Slider size="sm" min={5} max={90} class="flex-1" value={onion.value.opacity} oninput={(event) => update_onion({ opacity: Number(event.currentTarget.value) })} />
      <span class="w-6 text-right font-mono text-2xs tabular-nums">{onion.value.opacity}%</span>
    </label>
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex items-center gap-2">
        Tint before and after
        <span class="flex gap-1" aria-hidden="true">
          <span class="size-2.5 rounded-full bg-tertiary"></span>
          <span class="size-2.5 rounded-full bg-secondary"></span>
        </span>
      </span>
      <Switch checked={onion.value.tint} onchange={(event) => update_onion({ tint: event.currentTarget.checked })} />
    </label>
  </div>
</div>

<style>
  .hs-popover {
    position-area: top span-left;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 6px;
  }

  .tag {
    background: color-mix(in oklch, var(--secondary) 18%, transparent);
    box-shadow: inset 2px 0 0 var(--secondary);
  }

  .tag.active {
    background: color-mix(in oklch, var(--secondary) 34%, transparent);
  }
</style>

<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import { IconButton, Input, Segmented, Select, Separator, Slider, Switch } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    ArrowDown as ArrowDownIcon,
    ArrowLineLeft as ArrowLineLeftIcon,
    ArrowLineRight as ArrowLineRightIcon,
    ArrowUp as ArrowUpIcon,
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    Copy as CopyIcon,
    DotsThree as DotsThreeIcon,
    Eye as EyeIcon,
    EyeSlash as EyeSlashIcon,
    Ghost as GhostIcon,
    Lock as LockIcon,
    LockOpen as LockOpenIcon,
    Pause as PauseIcon,
    PencilSimple as PencilSimpleIcon,
    Play as PlayIcon,
    Plus as PlusIcon,
    Stack as StackIcon,
    Tag as TagIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import * as doc from "./document";
  import type { Editor } from "./editor.svelte";
  import type { Onion } from "./prefs";
  import { below } from "./menu";
  import { cel_key, Direction, type Layer } from "./model";
  import { PlayMode } from "./sequence";

  interface Props {
    editor: Editor;
    playing: boolean;
    mode: { value: PlayMode };
    range: { value: number };
    onion: { value: Onion };
    ontoggleplay: () => void;
  }

  let { editor, playing, mode, range, onion, ontoggleplay }: Props = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const { window: win } = get_app_context();

  const sprite = $derived(editor.sprite);
  const frames = $derived(sprite.frames);
  const layers = $derived([...sprite.layers].reverse());
  const current = $derived(editor.frame);

  let anchor = $state<number | null>(null);
  const selected = $derived.by(() => {
    if (anchor === null || anchor >= frames.length) return { from: current, to: current };
    return { from: Math.min(anchor, current), to: Math.max(anchor, current) };
  });
  const selected_indices = $derived(Array.from({ length: selected.to - selected.from + 1 }, (_, i) => selected.from + i));

  let duration_text = $state<number | null>(100);
  $effect(() => {
    duration_text = frames[current]?.duration ?? 100;
  });

  const DIRECTION_LABELS: Record<Direction, string> = { forward: "Forward", reverse: "Reverse", pingpong: "Ping-pong" };

  function select_frame(index: number, event: MouseEvent) {
    if (event.shiftKey) {
      anchor ??= current;
    } else {
      anchor = null;
    }
    editor.set_frame(index);
  }

  function select_cel(layer: Layer, index: number) {
    anchor = null;
    editor.set_layer(layer.id);
    editor.set_frame(index);
  }

  function add_frame(copy: boolean) {
    editor.apply((value) => doc.insert_frame(value, current, copy));
    anchor = null;
    editor.set_frame(current + 1);
  }

  function remove_frames() {
    const count = selected_indices.length;
    editor.apply((value) => {
      let next = value;
      for (let i = selected.to; i >= selected.from && next.frames.length > 1; i--) next = doc.remove_frame(next, i);
      return next;
    });
    anchor = null;
    editor.set_frame(Math.max(0, selected.from - (count > 1 ? 0 : 1)));
  }

  function move_frame(delta: number) {
    const target = current + delta;
    if (target < 0 || target >= frames.length) return;
    editor.apply((value) => doc.move_frame(value, current, target));
    anchor = null;
    editor.frame = target;
  }

  function set_duration() {
    const value = Number(duration_text);
    if (!Number.isFinite(value) || value < 1) return void (duration_text = frames[current].duration);
    editor.apply((sprite) => doc.set_durations(sprite, selected_indices, value));
  }

  async function frame_menu(index: number, event: MouseEvent) {
    event.preventDefault();
    if (index < selected.from || index > selected.to) select_frame(index, event);
    const many = selected_indices.length > 1;
    const choice = await dialogs.menu(
      [
        { id: "add", label: "New frame", icon: PlusIcon, shortcut: "Alt+N" },
        { id: "copy", label: "Duplicate frame", icon: CopyIcon, shortcut: "Alt+D" },
        { id: "duration", label: many ? `Duration of ${selected_indices.length} frames…` : "Duration…", icon: PencilSimpleIcon },
        { id: "tag", label: many ? `Tag frames ${selected.from + 1}–${selected.to + 1}…` : "Tag this frame…", icon: TagIcon },
        { separator: true },
        { id: "left", label: "Move left", icon: CaretLeftIcon, disabled: many || current === 0 },
        { id: "right", label: "Move right", icon: CaretRightIcon, disabled: many || current === frames.length - 1 },
        { separator: true },
        { id: "delete", label: many ? `Delete ${selected_indices.length} frames` : "Delete frame", icon: TrashIcon, danger: true, disabled: frames.length <= selected_indices.length },
      ],
      { anchor: { x: event.clientX, y: event.clientY } }
    );
    if (choice === "add") add_frame(false);
    else if (choice === "copy") add_frame(true);
    else if (choice === "duration") void prompt_duration();
    else if (choice === "tag") void new_tag();
    else if (choice === "left") move_frame(-1);
    else if (choice === "right") move_frame(1);
    else if (choice === "delete") remove_frames();
  }

  async function prompt_duration() {
    const text = await win.prompt("Frame duration in milliseconds", {
      initial: String(frames[current].duration),
      confirm_label: "Set",
    });
    const value = Number(text);
    if (text && Number.isFinite(value) && value >= 1) editor.apply((sprite) => doc.set_durations(sprite, selected_indices, value));
  }

  async function new_tag() {
    const name = await win.prompt("Tag name", { initial: `Tag ${sprite.tags.length + 1}`, confirm_label: "Create" });
    if (!name?.trim()) return;
    editor.apply((value) => doc.add_tag(value, name.trim(), selected.from, selected.to, Direction.FORWARD));
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

  function add_layer() {
    const index = sprite.layers.findIndex((layer) => layer.id === editor.layer.id);
    const result = doc.add_layer(editor.sprite, index);
    if (!result) return;
    editor.apply(() => result.sprite);
    editor.set_layer(result.layer.id);
  }

  async function rename_layer(layer: Layer) {
    const name = await win.prompt("Layer name", { initial: layer.name, confirm_label: "Rename" });
    if (name?.trim()) editor.apply((value) => doc.update_layer(value, layer.id, { name: name.trim() }));
  }

  async function layer_menu(layer: Layer, event: MouseEvent) {
    event.preventDefault();
    editor.set_layer(layer.id);
    const position = sprite.layers.findIndex((item) => item.id === layer.id);
    const choice = await dialogs.menu(
      [
        { id: "add", label: "New layer", icon: PlusIcon },
        { id: "copy", label: "Duplicate layer", icon: CopyIcon },
        { id: "rename", label: "Rename…", icon: PencilSimpleIcon },
        { separator: true },
        { id: "up", label: "Move up", icon: ArrowUpIcon, disabled: position === sprite.layers.length - 1 },
        { id: "down", label: "Move down", icon: ArrowDownIcon, disabled: position === 0 },
        { id: "merge", label: "Merge down", icon: StackIcon, disabled: position === 0 },
        { separator: true },
        { id: "delete", label: "Delete layer", icon: TrashIcon, danger: true, disabled: sprite.layers.length <= 1 },
      ],
      { anchor: event.type === "contextmenu" ? { x: event.clientX, y: event.clientY } : below(event) }
    );
    if (choice === "add") add_layer();
    else if (choice === "copy") {
      const result = doc.duplicate_layer(editor.sprite, layer.id);
      if (result) {
        editor.apply(() => result.sprite);
        editor.set_layer(result.layer.id);
      }
    } else if (choice === "rename") void rename_layer(layer);
    else if (choice === "up") editor.apply((value) => doc.move_layer(value, layer.id, 1));
    else if (choice === "down") editor.apply((value) => doc.move_layer(value, layer.id, -1));
    else if (choice === "merge") editor.apply((value) => doc.merge_down(value, layer.id));
    else if (choice === "delete") editor.apply((value) => doc.remove_layer(value, layer.id));
  }

  let onion_popover = $state<HTMLElement>();
  const popover_id = $props.id();

  const range_options = $derived([
    { value: "-1", label: "All frames" },
    ...sprite.tags.map((tag, i) => ({ value: String(i), label: tag.name })),
  ]);
  let range_value = $derived(String(range.value));

  function update_onion(patch: Partial<Onion>) {
    onion.value = { ...onion.value, ...patch };
  }
</script>

<section class="timeline flex min-h-0 flex-col bg-background-light" aria-label="Timeline">
  <div class="flex flex-wrap items-center gap-1 border-b border-foreground/8 px-2 py-1.5">
    <div class="flex items-center" role="group" aria-label="Playback">
      <IconButton label="First frame" size="sm" onclick={() => editor.set_frame(0)}><ArrowLineLeftIcon weight="bold" /></IconButton>
      <IconButton label="Previous frame (,)" size="sm" onclick={() => editor.set_frame(current - 1)}><CaretLeftIcon weight="bold" /></IconButton>
      <IconButton label={playing ? "Pause (Enter)" : "Play (Enter)"} size="sm" pressed={playing} onclick={ontoggleplay}>
        {#if playing}<PauseIcon weight="fill" />{:else}<PlayIcon weight="fill" />{/if}
      </IconButton>
      <IconButton label="Next frame (.)" size="sm" onclick={() => editor.set_frame(current + 1)}><CaretRightIcon weight="bold" /></IconButton>
      <IconButton label="Last frame" size="sm" onclick={() => editor.set_frame(frames.length - 1)}><ArrowLineRightIcon weight="bold" /></IconButton>
    </div>
    <Segmented
      size="sm"
      label="Playback"
      class="hidden @lg:inline-flex"
      options={[
        { value: PlayMode.LOOP, label: "Loop" },
        { value: PlayMode.PINGPONG, label: "Ping-pong" },
        { value: PlayMode.ONCE, label: "Once" },
      ]}
      bind:value={mode.value}
    />
    {#if sprite.tags.length}
      <Select
        size="sm"
        class="w-32"
        aria-label="Play range"
        options={range_options}
        bind:value={() => range_value, (value) => (range.value = Number(value))}
      />
    {/if}

    <span class="min-w-2 flex-1"></span>

    <IconButton
      label="Onion skin"
      size="sm"
      pressed={onion.value.enabled}
      onclick={() => update_onion({ enabled: !onion.value.enabled })}
    >
      <GhostIcon weight={onion.value.enabled ? "fill" : "bold"} />
    </IconButton>
    <IconButton label="Onion skin settings" size="sm" popovertarget="onion-{popover_id}" style="anchor-name: --onion-{popover_id}">
      <DotsThreeIcon weight="bold" />
    </IconButton>

    <Separator vertical />

    <div class="flex items-center" role="group" aria-label="Frames">
      <IconButton label="New frame (Alt+N)" size="sm" onclick={() => add_frame(false)}><PlusIcon weight="bold" /></IconButton>
      <IconButton label="Duplicate frame (Alt+D)" size="sm" onclick={() => add_frame(true)}><CopyIcon weight="bold" /></IconButton>
      <IconButton label="Delete frame" size="sm" disabled={frames.length <= selected_indices.length} onclick={remove_frames}><TrashIcon weight="bold" /></IconButton>
      <IconButton label="Tag selected frames" size="sm" onclick={new_tag}><TagIcon weight="bold" /></IconButton>
    </div>
    <label class="flex items-center gap-1 text-2xs text-foreground/65" title={selected_indices.length > 1 ? `Duration of ${selected_indices.length} frames` : "Frame duration"}>
      <Input
        type="number"
        size="sm"
        min={1}
        max={65535}
        class="w-18 font-mono text-2xs tabular-nums"
        aria-label="Frame duration in milliseconds"
        bind:value={duration_text}
        onchange={set_duration}
      />
      ms
    </label>
  </div>

  <div class="grid-scroll min-h-0 flex-1 overflow-auto" style:--frames={frames.length}>
    <div class="cels grid w-max min-w-full">
      <div class="corner sticky top-0 left-0 z-3 flex items-center gap-0.5 border-r border-b border-foreground/8 bg-background-light px-1.5">
        <span class="flex-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Layers</span>
        <IconButton label="New layer" size="sm" onclick={add_layer}><PlusIcon weight="bold" /></IconButton>
        <IconButton label="Layer actions" size="sm" onclick={(event) => layer_menu(editor.layer, event)}><DotsThreeIcon weight="bold" /></IconButton>
      </div>
      {#each frames as frame, index (frame.id)}
        <button
          type="button"
          class={[
            "frame sticky top-0 z-2 flex flex-col items-center justify-center border-b border-foreground/8 bg-background-light leading-none",
            index === current && "current",
            index >= selected.from && index <= selected.to && selected.from !== selected.to && "ranged",
          ]}
          aria-label="Frame {index + 1}, {frame.duration} ms"
          aria-current={index === current}
          onclick={(event) => select_frame(index, event)}
          ondblclick={prompt_duration}
          oncontextmenu={(event) => frame_menu(index, event)}
        >
          <span class="font-mono text-2xs tabular-nums">{index + 1}</span>
          <span class="font-mono text-[0.5625rem] text-foreground/50 tabular-nums">{frame.duration}</span>
        </button>
      {/each}

      {#if sprite.tags.length}
        <div class="sticky left-0 z-1 flex items-center border-r border-b border-foreground/8 bg-background-light px-2 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Tags</div>
        <div class="tags relative border-b border-foreground/8" style:grid-column="2 / span {frames.length}">
          {#each sprite.tags as tag, i (i)}
            <button
              type="button"
              class={["tag absolute truncate", range.value === i && "active"]}
              style:left="calc({tag.from} * var(--cell) + 2px)"
              style:width="calc({tag.to - tag.from + 1} * var(--cell) - 4px)"
              style:top="{(i % 2) * 50}%"
              title="{tag.name} · frames {tag.from + 1}–{tag.to + 1} · {DIRECTION_LABELS[tag.direction]}"
              onclick={(event) => tag_menu(i, event)}
              oncontextmenu={(event) => tag_menu(i, event)}
            >
              {tag.name}
            </button>
          {/each}
        </div>
      {/if}

      {#each layers as layer (layer.id)}
        {@const active = layer.id === editor.layer.id}
        <div
          class={["layer sticky left-0 z-1 flex items-center gap-0.5 border-r border-foreground/8 pr-1 pl-0.5", active ? "bg-primary/12" : "bg-background-light"]}
          role="group"
          aria-label={layer.name}
          oncontextmenu={(event) => layer_menu(layer, event)}
        >
          <IconButton
            label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
            size="sm"
            onclick={() => editor.apply((value) => doc.update_layer(value, layer.id, { visible: !layer.visible }))}
          >
            {#if layer.visible}<EyeIcon weight="bold" />{:else}<EyeSlashIcon weight="bold" class="opacity-50" />{/if}
          </IconButton>
          <IconButton
            label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
            size="sm"
            onclick={() => editor.apply((value) => doc.update_layer(value, layer.id, { locked: !layer.locked }))}
          >
            {#if layer.locked}<LockIcon weight="fill" />{:else}<LockOpenIcon weight="bold" class="opacity-35" />{/if}
          </IconButton>
          <button
            type="button"
            class={["min-w-0 flex-1 truncate rounded-sm px-1 py-1 text-left text-ui", active ? "font-medium text-primary" : "text-foreground/80", !layer.visible && "opacity-50"]}
            title="{layer.name} · double-click to rename"
            onclick={() => editor.set_layer(layer.id)}
            ondblclick={() => rename_layer(layer)}
          >
            {layer.name}
          </button>
          {#if layer.opacity < 1}
            <span class="font-mono text-2xs text-foreground/50 tabular-nums">{Math.round(layer.opacity * 100)}%</span>
          {/if}
        </div>
        {#each frames as frame, index (frame.id)}
          {@const filled = sprite.cels.has(cel_key(layer.id, frame.id))}
          <button
            type="button"
            class={["cel grid place-items-center", index === current && "current", active && "active-row", active && index === current && "focused"]}
            aria-label="{layer.name}, frame {index + 1}{filled ? '' : ', empty'}"
            onclick={() => select_cel(layer, index)}
            oncontextmenu={(event) => frame_menu(index, event)}
          >
            <span class={["dot", filled && "filled"]}></span>
          </button>
        {/each}
      {/each}
    </div>
  </div>

  <div class="flex items-center gap-2 border-t border-foreground/8 px-2 py-1">
    <span class="truncate text-2xs text-foreground/65">{editor.layer.name}</span>
    <label class="flex flex-1 items-center gap-2 text-2xs text-foreground/65 @md:max-w-64">
      Opacity
      <Slider
        size="sm"
        min={0}
        max={100}
        class="flex-1"
        value={Math.round(editor.layer.opacity * 100)}
        onchange={(event) => {
          const opacity = Number(event.currentTarget.value) / 100;
          editor.apply((value) => doc.update_layer(value, editor.layer.id, { opacity }));
        }}
      />
      <span class="w-8 text-right font-mono tabular-nums">{Math.round(editor.layer.opacity * 100)}%</span>
    </label>
    <span class="ml-auto font-mono text-2xs text-foreground/65 tabular-nums">
      {current + 1}/{frames.length} · {frames.reduce((sum, frame) => sum + frame.duration, 0)} ms
    </span>
  </div>
</section>

<div
  bind:this={onion_popover}
  id="onion-{popover_id}"
  popover="auto"
  class="onion-popover m-0 w-64 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
  style="position-anchor: --onion-{popover_id}"
>
  <div class="flex flex-col gap-3">
    <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Onion skin</p>
    <label class="flex items-center justify-between gap-3 text-ui">
      Show ghosts
      <Switch checked={onion.value.enabled} onchange={(event) => update_onion({ enabled: event.currentTarget.checked })} />
    </label>
    <label class="flex items-center gap-2 text-ui">
      <span class="w-14">Before</span>
      <Slider size="sm" min={0} max={4} class="flex-1" value={onion.value.before} oninput={(event) => update_onion({ before: Number(event.currentTarget.value) })} />
      <span class="w-4 text-right font-mono text-2xs tabular-nums">{onion.value.before}</span>
    </label>
    <label class="flex items-center gap-2 text-ui">
      <span class="w-14">After</span>
      <Slider size="sm" min={0} max={4} class="flex-1" value={onion.value.after} oninput={(event) => update_onion({ after: Number(event.currentTarget.value) })} />
      <span class="w-4 text-right font-mono text-2xs tabular-nums">{onion.value.after}</span>
    </label>
    <label class="flex items-center gap-2 text-ui">
      <span class="w-14">Opacity</span>
      <Slider size="sm" min={5} max={90} class="flex-1" value={onion.value.opacity} oninput={(event) => update_onion({ opacity: Number(event.currentTarget.value) })} />
      <span class="w-8 text-right font-mono text-2xs tabular-nums">{onion.value.opacity}%</span>
    </label>
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex items-center gap-2">
        Tint
        <span class="flex gap-1" aria-hidden="true">
          <span class="size-2.5 rounded-full bg-tertiary"></span>
          <span class="size-2.5 rounded-full bg-secondary"></span>
        </span>
      </span>
      <Switch checked={onion.value.tint} onchange={(event) => update_onion({ tint: event.currentTarget.checked })} />
    </label>
    <p class="text-2xs text-foreground/65">Before frames take the tertiary tint, after frames the secondary one.</p>
  </div>
</div>

<style>
  .grid-scroll {
    --cell: 1.75rem;
    --names: 11rem;
  }

  .cels {
    grid-template-columns: var(--names) repeat(var(--frames), var(--cell));
    grid-template-rows: 2.25rem;
    grid-auto-rows: 1.875rem;
  }

  .frame {
    color: color-mix(in oklch, var(--foreground) 70%, transparent);
    cursor: pointer;
  }

  .frame:hover {
    background: color-mix(in oklch, var(--foreground) 6%, var(--background-light));
  }

  .frame.ranged {
    background: color-mix(in oklch, var(--primary) 8%, var(--background-light));
  }

  .frame.current {
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 15%, var(--background-light));
    box-shadow: inset 0 -2px 0 var(--primary);
  }

  .cel {
    cursor: pointer;
    border-right: 1px solid color-mix(in oklch, var(--foreground) 5%, transparent);
    border-bottom: 1px solid color-mix(in oklch, var(--foreground) 5%, transparent);
  }

  .cel:hover {
    background: color-mix(in oklch, var(--foreground) 6%, transparent);
  }

  .cel.current {
    background: color-mix(in oklch, var(--primary) 7%, transparent);
  }

  .cel.active-row {
    background: color-mix(in oklch, var(--primary) 5%, transparent);
  }

  .cel.focused {
    background: color-mix(in oklch, var(--primary) 18%, transparent);
    box-shadow: inset 0 0 0 1.5px var(--primary);
    border-radius: var(--radius-xs);
  }

  .dot {
    width: 0.4375rem;
    height: 0.4375rem;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1.25px color-mix(in oklch, var(--foreground) 30%, transparent);
  }

  .dot.filled {
    width: 0.5625rem;
    height: 0.5625rem;
    background: color-mix(in oklch, var(--foreground) 80%, transparent);
    box-shadow: none;
  }

  .cel.focused .dot.filled {
    background: var(--primary);
  }

  .tags {
    min-height: 1.875rem;
  }

  .tag {
    height: 46%;
    margin-top: 2px;
    padding-inline: 0.375rem;
    border-radius: var(--radius-xs);
    font-size: var(--text-2xs);
    line-height: 1;
    text-align: left;
    color: var(--foreground);
    background: color-mix(in oklch, var(--secondary) 22%, transparent);
    box-shadow: inset 2px 0 0 var(--secondary);
    cursor: pointer;
  }

  .tag.active {
    background: color-mix(in oklch, var(--secondary) 38%, transparent);
  }

  .onion-popover {
    position-area: top span-left;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }

  @media (pointer: coarse) {
    .grid-scroll {
      --cell: 2.25rem;
      --names: 9.5rem;
    }

    .cels {
      grid-auto-rows: 2.25rem;
    }
  }
</style>

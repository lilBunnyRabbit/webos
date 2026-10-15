<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import { IconButton } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    Copy as CopyIcon,
    FilmStrip as FilmStripIcon,
    Ghost as GhostIcon,
    Pause as PauseIcon,
    PencilSimple as PencilSimpleIcon,
    Play as PlayIcon,
    Plus as PlusIcon,
    SlidersHorizontal as SlidersHorizontalIcon,
    Stack as StackIcon,
    Tag as TagIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import * as doc from "./document";
  import type { Editor } from "./editor.svelte";
  import HopspriteAnimationPopover from "./hopsprite-animation-popover.svelte";
  import HopspriteLayersPopover from "./hopsprite-layers-popover.svelte";
  import HopspriteThumb from "./hopsprite-thumb.svelte";
  import { Direction } from "./model";
  import type { Onion } from "./prefs";
  import type { PlayMode } from "./sequence";

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
  const popover = $props.id();

  const sprite = $derived(editor.sprite);
  const frames = $derived(sprite.frames);
  const current = $derived(editor.frame);
  let height = $state(64);
  const thumb = $derived(Math.max(28, Math.min(240, height - 14)));

  let anchor = $state<number | null>(null);
  const selected = $derived.by(() => {
    if (anchor === null || anchor >= frames.length) return { from: current, to: current };
    return { from: Math.min(anchor, current), to: Math.max(anchor, current) };
  });
  const selected_indices = $derived(Array.from({ length: selected.to - selected.from + 1 }, (_, i) => selected.from + i));

  let strip = $state<HTMLElement>();
  let section = $state<HTMLElement>();

  $effect(() => {
    if (!section) return;
    const observer = new ResizeObserver(([entry]) => (height = Math.round(entry.contentRect.height)));
    observer.observe(section);
    return () => observer.disconnect();
  });

  $effect(() => {
    const index = current;
    const item = strip?.querySelector<HTMLElement>(`[data-frame="${index}"]`);
    item?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  function select_frame(index: number, event: MouseEvent) {
    if (event.shiftKey) anchor ??= current;
    else anchor = null;
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

  async function prompt_duration() {
    const text = await win.prompt(selected_indices.length > 1 ? `Duration of ${selected_indices.length} frames in milliseconds` : "Frame duration in milliseconds", {
      initial: String(frames[current].duration),
      confirm_label: "Set",
    });
    const value = Number(text);
    if (text && Number.isFinite(value) && value >= 1) editor.apply((value_sprite) => doc.set_durations(value_sprite, selected_indices, Math.round(value)));
  }

  async function new_tag() {
    const name = await win.prompt("Tag name", { initial: `Tag ${sprite.tags.length + 1}`, confirm_label: "Create" });
    if (!name?.trim()) return;
    editor.apply((value) => doc.add_tag(value, name.trim(), selected.from, selected.to, Direction.FORWARD));
  }

  async function frame_menu(index: number, event: MouseEvent) {
    event.preventDefault();
    if (index < selected.from || index > selected.to) select_frame(index, event);
    const many = selected_indices.length > 1;
    const choice = await dialogs.menu(
      [
        { id: "copy", label: "Duplicate frame", icon: CopyIcon, shortcut: "Alt+D" },
        { id: "add", label: "New empty frame", icon: PlusIcon, shortcut: "Alt+N" },
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

  function tag_at(index: number) {
    return sprite.tags.find((tag) => index >= tag.from && index <= tag.to);
  }
</script>

<section bind:this={section} class="strip flex h-full min-h-0 items-center gap-1 bg-background-light px-1.5" aria-label="Frames">
  <div class="flex shrink-0 items-center gap-0.5">
    <IconButton label={playing ? "Pause (Enter)" : frames.length > 1 ? "Play (Enter)" : "Add a frame to play"} pressed={playing} disabled={frames.length < 2 && !playing} onclick={ontoggleplay}>
      {#if playing}<PauseIcon weight="fill" />{:else}<PlayIcon weight="fill" />{/if}
    </IconButton>
    <IconButton label="Onion skin: show the frames around this one" pressed={onion.value.enabled} disabled={frames.length < 2} onclick={() => (onion.value = { ...onion.value, enabled: !onion.value.enabled })}>
      <GhostIcon weight={onion.value.enabled ? "fill" : "bold"} />
    </IconButton>
  </div>

  <div bind:this={strip} class="frames flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden px-1 py-1.5" role="listbox" aria-label="Frames" aria-orientation="horizontal">
    {#each frames as frame, index (frame.id)}
      {@const tag = tag_at(index)}
      <button
        type="button"
        role="option"
        data-frame={index}
        class={["frame relative grid shrink-0 place-items-center rounded-md", index === current && "current", index >= selected.from && index <= selected.to && selected.from !== selected.to && "ranged"]}
        style:width="{thumb}px"
        style:height="{thumb}px"
        aria-selected={index === current}
        aria-label="Frame {index + 1}, {frame.duration} ms{tag ? `, tag ${tag.name}` : ''}"
        title="Frame {index + 1} · {frame.duration} ms{tag ? ` · ${tag.name}` : ''} · right-click for more"
        onclick={(event) => select_frame(index, event)}
        ondblclick={prompt_duration}
        oncontextmenu={(event) => frame_menu(index, event)}
      >
        <HopspriteThumb {sprite} frame={index} size={thumb - 10} />
        {#if thumb >= 40}
          <span class="number absolute bottom-0.5 left-0.5 rounded-xs px-1 font-mono text-[0.625rem] leading-3.5 tabular-nums">{index + 1}</span>
        {/if}
        {#if tag}<span class="tag absolute inset-x-1 -bottom-1 h-0.5 rounded-full" aria-hidden="true"></span>{/if}
      </button>
    {/each}
    <IconButton label="Add frame: a copy of this one (Alt+D)" class="shrink-0 border border-dashed border-foreground/20" onclick={() => add_frame(true)}>
      <PlusIcon weight="bold" />
    </IconButton>
  </div>

  <div class="flex shrink-0 items-center gap-0.5">
    <span class="hidden px-1 font-mono text-2xs text-foreground/80 tabular-nums @md:inline">{current + 1}/{frames.length}</span>
    <IconButton label="Layers ({sprite.layers.length})" class="strip-layers" popovertarget="layers-{popover}" style="anchor-name: --layers-{popover}">
      <StackIcon weight="bold" />
    </IconButton>
    <IconButton label="Timing, tags and onion skin" popovertarget="animation-{popover}" style="anchor-name: --animation-{popover}">
      {#if frames.length > 1}<SlidersHorizontalIcon weight="bold" />{:else}<FilmStripIcon weight="bold" />{/if}
    </IconButton>
  </div>
</section>

<HopspriteLayersPopover id="layers-{popover}" anchor="--layers-{popover}" {editor} />
<HopspriteAnimationPopover
  id="animation-{popover}"
  anchor="--animation-{popover}"
  {editor}
  {playing}
  {mode}
  {range}
  {onion}
  {selected}
  ontag={new_tag}
  {ontoggleplay}
/>

<style>
  .frames {
    scrollbar-width: thin;
  }

  .frame {
    cursor: pointer;
    background: color-mix(in oklch, var(--foreground) 5%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 10%, transparent);
    transition: background 150ms var(--ease-out);
  }

  .frame:hover {
    background: color-mix(in oklch, var(--foreground) 10%, transparent);
  }

  .frame.ranged {
    background: color-mix(in oklch, var(--primary) 12%, transparent);
  }

  .frame.current {
    background: color-mix(in oklch, var(--primary) 15%, transparent);
    box-shadow: inset 0 0 0 2px var(--primary);
  }

  .number {
    color: color-mix(in oklch, var(--foreground) 80%, transparent);
    background: color-mix(in oklch, var(--background-light) 85%, transparent);
  }

  .frame.current .number {
    color: var(--background);
    background: var(--primary);
  }

  .tag {
    background: var(--secondary);
  }
</style>

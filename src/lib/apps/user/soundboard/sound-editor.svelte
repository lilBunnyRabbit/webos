<script lang="ts">
  import { Button } from "$lib/core/components/ui";
  import { Waveform } from "$kit/components/waveform";
  import { ArrowCounterClockwise as ResetIcon, ArrowsInLineHorizontal as KeepIcon, Play as PlayIcon, Scissors as ScissorsIcon, Stop as StopIcon } from "phosphor-svelte";
  import { untrack, type Snippet } from "svelte";
  import type { SoundEditor } from "./editor.svelte";
  import { moved_mark, type Marks } from "./timeline";

  interface Props {
    editor: SoundEditor;
    label: string;
    video?: string | null;
    actions?: Snippet;
  }

  let { editor, label, video = null, actions }: Props = $props();

  let preview = $state<HTMLVideoElement>();
  let marks: Marks = untrack(() => ({ start: editor.start, end: editor.end, selection: editor.selection }));

  $effect(() => {
    const next: Marks = { start: editor.start, end: editor.end, selection: editor.selection };
    const target = moved_mark(marks, next);
    marks = next;
    if (preview && target !== null && !untrack(() => editor.playing)) preview.currentTime = editor.source_time(target);
  });

  $effect(() => {
    const element = preview;
    const time = editor.playhead;
    if (!element) return;
    if (time === null) return element.pause();
    const source = editor.source_time(time);
    // The sound plays from the edit, so the picture jumps at each cut instead of drifting past it.
    if (Math.abs(element.currentTime - source) > 0.25) element.currentTime = source;
    if (element.paused) element.play().catch(() => {});
  });

  const BAR = "min-w-0 gap-1 px-1 pointer-coarse:h-11";
</script>

<div class="grid gap-3">
  {#if video}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={preview}
      src={video}
      muted
      playsinline
      disablepictureinpicture
      preload="auto"
      aria-label="Video at the trim point"
      class="h-[min(13rem,30cqh)] w-full rounded-lg bg-background-darker object-contain"
    ></video>
  {/if}
  <Waveform pcm={editor.pcm!} bind:start={editor.start} bind:end={editor.end} bind:selection={editor.selection} playhead={editor.playhead} {label} />
  <div class="grid grid-cols-4 gap-1.5" role="toolbar" aria-label="Edit the sound">
    {#if editor.playing}
      <Button variant="secondary" size="sm" class={BAR} onclick={() => editor.stop()}><StopIcon weight="fill" /> Stop</Button>
    {:else}
      {@const name = editor.selection ? "Play selection" : "Play"}
      <Button variant="secondary" size="sm" class={BAR} aria-label={name} title={name} onclick={() => editor.play()}><PlayIcon weight="fill" /> Play</Button>
    {/if}
    <Button
      variant="secondary"
      size="sm"
      class={BAR}
      aria-label="Keep selection"
      title="Keep only the selection"
      disabled={!editor.selection}
      onclick={() => editor.keep_selection()}
    >
      <KeepIcon weight="bold" /> Keep
    </Button>
    <Button
      variant="secondary"
      size="sm"
      class={BAR}
      aria-label="Delete selection"
      title="Delete the selection"
      disabled={!editor.selection}
      onclick={() => editor.delete_selection()}
    >
      <ScissorsIcon weight="bold" /> Delete
    </Button>
    <Button variant="secondary" size="sm" class={BAR} aria-label="Undo edits" title="Undo all edits" disabled={!editor.changed} onclick={() => editor.reset()}>
      <ResetIcon weight="bold" /> Undo
    </Button>
  </div>
  {#if actions}
    <div class="flex flex-wrap items-center justify-end gap-2">{@render actions()}</div>
  {/if}
</div>

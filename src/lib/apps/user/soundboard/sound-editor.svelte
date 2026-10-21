<script lang="ts">
  import { Button, IconButton } from "$lib/core/components/ui";
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

  const time = (seconds: number) => seconds.toFixed(2);
</script>

<div class="grid gap-2">
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
  <p class="flex flex-wrap justify-between gap-x-3 font-mono text-2xs whitespace-nowrap text-foreground/80 tabular-nums">
    <span>{time(editor.start)}–{time(editor.end)} s</span>
    {#if editor.selection}<span>selected {time(editor.selection.end - editor.selection.start)} s</span>{/if}
    <span>{time(editor.end - editor.start)} of {time(editor.duration)} s</span>
  </p>
  <p class="text-2xs text-foreground/80">Drag the handles to trim. Drag across the middle to select a part, then keep only it or delete it. Pinch or Ctrl+scroll to zoom.</p>
  <div class="flex flex-wrap items-center gap-2">
    {#if editor.playing}
      <Button size="sm" variant="quiet" class="pointer-coarse:h-11" onclick={() => editor.stop()}><StopIcon weight="fill" /> Stop</Button>
    {:else}
      <Button size="sm" variant="quiet" class="pointer-coarse:h-11" onclick={() => editor.play()}><PlayIcon weight="fill" /> {editor.selection ? "Play selection" : "Play"}</Button>
    {/if}
    <Button size="sm" variant="quiet" class="pointer-coarse:h-11" disabled={!editor.selection} onclick={() => editor.keep_selection()}><KeepIcon weight="bold" /> Keep selection</Button>
    <Button size="sm" variant="quiet" class="pointer-coarse:h-11" disabled={!editor.selection} onclick={() => editor.delete_selection()}><ScissorsIcon weight="bold" /> Delete selection</Button>
    <IconButton label="Undo edits" size="sm" class="pointer-coarse:size-11" disabled={!editor.changed} onclick={() => editor.reset()}><ResetIcon weight="bold" /></IconButton>
    {#if actions}
      <span class="flex-1"></span>
      {@render actions()}
    {/if}
  </div>
</div>

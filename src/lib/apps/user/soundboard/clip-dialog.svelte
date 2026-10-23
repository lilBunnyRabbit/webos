<script lang="ts">
  import kernel, { type DialogProps, type FilesService, type TaskJob } from "$lib/core/api";
  import { Button, Spinner } from "$lib/core/components/ui";
  import { error_message } from "$lib/core/utils";
  import { onDestroy, onMount, untrack } from "svelte";
  import { clip_name } from "./board";
  import { SoundEditor } from "./editor.svelte";
  import SoundEditorPanel from "./sound-editor.svelte";
  import { import_sound } from "./store";

  let { file, resolve }: DialogProps<string> & { file: File } = $props();

  const files = $derived(kernel.service<FilesService>("files"));

  const editor = new SoundEditor();
  const url = untrack(() => URL.createObjectURL(file));
  let recording = $state<TaskJob<Blob> | null>(null);
  let failed = $state<string | null>(null);
  let saving = $state(false);
  let save_error = $state<string | null>(null);
  let closed = false;

  onMount(() => void load());

  onDestroy(() => {
    closed = true;
    recording?.cancel();
    editor.dispose();
    URL.revokeObjectURL(url);
  });

  async function load() {
    try {
      await editor.load(file);
      return;
    } catch {
      if (closed) return;
    }
    try {
      const { record_video_sound } = await import("./record");
      if (closed) return;
      const job = record_video_sound(file);
      recording = job;
      const blob = await job.done;
      recording = null;
      if (closed) return;
      if (!blob) throw new Error(job.error ?? "Reading the sound stopped.");
      await editor.load(new File([blob], "sound.webm", { type: "audio/webm" }));
    } catch (reason) {
      recording = null;
      failed = error_message(reason);
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const blob = editor.render(true);
    if (!blob) return;
    editor.stop();
    saving = true;
    save_error = null;
    try {
      resolve(await import_sound(files, new File([blob], clip_name(file.name), { type: "audio/wav" })));
    } catch (reason) {
      save_error = error_message(reason);
    } finally {
      saving = false;
    }
  }
</script>

<form
  class="grid max-h-[calc(100cqh-2rem)] w-[min(34rem,calc(100cqw-2rem))] gap-4 overflow-y-auto scroll-pb-20 rounded-2xl bg-background-lighter p-5 shadow-popover"
  onsubmit={submit}
>
  <div class="grid min-w-0 gap-1">
    <h2 class="text-sm font-semibold">New pad from a video</h2>
    <p class="truncate font-mono text-2xs text-foreground/80" title={file.name}>{file.name}</p>
    <p class="text-2xs text-foreground/80">Keep the part you want on the pad. The video isn't changed.</p>
  </div>

  {#if failed}
    <p class="text-ui text-error">Couldn't read the sound: {failed}</p>
  {:else if editor.pcm}
    <SoundEditorPanel {editor} label="Sound from the video" video={url} />
  {:else}
    <div class="grid h-40 place-content-center justify-items-center gap-2 rounded-lg bg-background-darker px-4 text-center">
      <Spinner label="Reading the sound" />
      {#if recording}
        <p class="text-2xs text-foreground/80">
          Playing the video through to record its sound{recording.message ? ` · ${recording.message}` : "…"}
        </p>
      {/if}
    </div>
  {/if}

  {#if save_error}<p class="text-ui text-error">{save_error}</p>{/if}

  <div class="sticky -bottom-5 -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-2 border-t border-hairline bg-background-lighter px-5 py-3">
    <Button variant="quiet" onclick={() => resolve(null)}>Cancel</Button>
    <Button variant="primary" type="submit" disabled={!editor.pcm || saving}>{saving ? "Adding…" : "Add pad"}</Button>
  </div>
</form>

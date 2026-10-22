<script lang="ts" module>
  export interface Capture {
    journal: string;
    text: string;
    mood?: number;
  }
</script>

<script lang="ts">
  import type { DialogProps } from "$lib/core/api";
  import type { Attachment } from "svelte/attachments";
  import { Button, Select, Textarea } from "$lib/core/components/ui";
  import { LockKey as LockKeyIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import MoodPicker from "./mood-picker.svelte";

  let { journals, journal, mood: initial_mood, resolve }: DialogProps<Capture> & { journals: string[]; journal: string; mood?: number } = $props();

  let text = $state("");
  let mood = $state<number | undefined>(untrack(() => initial_mood));
  let target = $state(untrack(() => journal));

  const focus: Attachment<HTMLTextAreaElement> = (input) => input.focus();

  function submit(event?: SubmitEvent) {
    event?.preventDefault();
    if (text.trim() || mood) resolve({ journal: target, text: text.trim(), ...(mood ? { mood } : {}) });
  }
</script>

<!-- The field comes first: a native modal dialog focuses its first focusable element. -->
<form class="grid w-[min(30rem,calc(100vw-2rem))] gap-3 rounded-2xl bg-background-lighter p-4 shadow-popover" onsubmit={submit}>
  <Textarea
    bind:value={text}
    rows={3}
    placeholder="Write a line"
    aria-label="Write a line"
    class="max-h-60 min-h-20 resize-none field-sizing-content text-base"
    onkeydown={(event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submit();
      }
    }}
    {@attach focus}
  />
  <MoodPicker value={mood} onchange={(value) => (mood = value)} label="Mood" />
  <p class="flex items-start gap-1.5 text-2xs text-foreground/80">
    <LockKeyIcon class="mt-px size-3.5 shrink-0" />
    <span>Encrypted the moment you save. Reading it needs the journal unlocked.</span>
  </p>
  <div class="flex flex-wrap items-center justify-end gap-2">
    {#if journals.length > 1}
      <Select size="sm" class="mr-auto w-auto max-w-48" aria-label="Journal" bind:value={target} options={journals.map((name) => ({ value: name, label: name }))} />
    {/if}
    <Button variant="quiet" onclick={() => resolve(null)}>Cancel</Button>
    <Button variant="primary" type="submit" disabled={!text.trim() && !mood}>Save</Button>
  </div>
</form>

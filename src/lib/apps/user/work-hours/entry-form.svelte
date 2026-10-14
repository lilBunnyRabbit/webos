<script lang="ts" module>
  export interface EntryDraft {
    day: string;
    start: string;
    end: string;
    description: string;
  }
</script>

<script lang="ts">
  import { Button, Input } from "$lib/core/components/ui";
  import { untrack } from "svelte";
  import { entry_error } from "./data";

  interface Props {
    initial: EntryDraft;
    submit_label: string;
    onsubmit: (draft: EntryDraft) => void;
    oncancel?: () => void;
  }

  let { initial, submit_label, onsubmit, oncancel }: Props = $props();

  let draft = $state<EntryDraft>(untrack(() => ({ ...initial })));
  let tried = $state(false);
  const error = $derived(draft.day ? entry_error(draft.start, draft.end) : "Pick a day");

  function submit(event: SubmitEvent) {
    event.preventDefault();
    tried = true;
    if (error) return;
    onsubmit({ ...draft, description: draft.description.trim() });
  }
</script>

<form class="@container/form grid gap-2" onsubmit={submit}>
  <div class="grid grid-cols-2 gap-2 @sm/form:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
    <label class="col-span-2 grid gap-1 @sm/form:col-span-1">
      <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Date</span>
      <Input type="date" size="sm" bind:value={draft.day} required />
    </label>
    <label class="grid gap-1">
      <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Start</span>
      <Input type="time" size="sm" bind:value={draft.start} required />
    </label>
    <label class="grid gap-1">
      <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">End</span>
      <Input type="time" size="sm" bind:value={draft.end} required />
    </label>
  </div>
  <Input size="sm" bind:value={draft.description} placeholder="What did you work on?" aria-label="Description" />
  <div class="flex items-center gap-2">
    <p class="min-w-0 flex-1 truncate text-2xs text-error" aria-live="polite">{tried && error ? error : ""}</p>
    {#if oncancel}<Button variant="quiet" size="sm" onclick={oncancel}>Cancel</Button>{/if}
    <Button variant={oncancel ? "primary" : "secondary"} size="sm" type="submit">{submit_label}</Button>
  </div>
</form>

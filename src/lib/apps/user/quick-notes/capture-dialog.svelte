<script lang="ts" module>
  export interface Capture {
    kind: "note" | "todo";
    text: string;
  }
</script>

<script lang="ts">
  import type { DialogProps } from "$lib/core/api";
  import type { Attachment } from "svelte/attachments";
  import { Button, Input, Segmented } from "$lib/core/components/ui";

  let { from, resolve }: DialogProps<Capture> & { from: string } = $props();

  let text = $state("");
  let kind = $state<Capture["kind"]>("note");

  const focus: Attachment<HTMLInputElement> = (input) => input.focus();

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (text.trim()) resolve({ kind, text: text.trim() });
  }
</script>

<!-- The field comes first: a native modal dialog focuses its first focusable element. -->
<form class="grid w-[min(32rem,calc(100vw-2rem))] gap-3 rounded-2xl bg-background-lighter p-4 shadow-popover" onsubmit={submit}>
  <div class="flex items-baseline justify-between gap-3">
    <h2 class="text-sm font-semibold">Quick note</h2>
    {#if from}<p class="min-w-0 truncate font-mono text-2xs text-foreground/55">from {from}</p>{/if}
  </div>
  <Input bind:value={text} size="lg" placeholder={kind === "note" ? "An idea, #tags inline" : "Something to do"} aria-label="Text" {@attach focus} />
  <div class="flex items-center justify-between gap-3">
    <Segmented
      bind:value={kind}
      label="Capture as"
      size="sm"
      options={[
        { value: "note", label: "Note" },
        { value: "todo", label: "Todo" },
      ]}
    />
    <div class="flex shrink-0 gap-2">
      <Button variant="quiet" onclick={() => resolve(null)}>Cancel</Button>
      <Button variant="primary" type="submit" disabled={!text.trim()}>Save</Button>
    </div>
  </div>
</form>

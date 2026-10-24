<script lang="ts">
  import type { DialogProps } from "$lib/core/api";
  import type { Attachment } from "svelte/attachments";
  import { untrack } from "svelte";
  import { Button, Input } from "../ui";

  export interface PromptOptions {
    detail?: string;
    initial?: string;
    placeholder?: string;
    /** Defaults to "OK". */
    confirm_label?: string;
    /** Returns an error message to block submitting, or `null` when the value is fine. */
    validate?: (value: string) => string | null;
    /**
     * Select only the part before the last dot on open, so renaming `notes.md` starts on `notes` (like every file
     * manager).
     */
    select_stem?: boolean;
    /** Destructive action: red confirm button. The field keeps the initial focus. */
    danger?: boolean;
  }

  let {
    message,
    detail,
    initial = "",
    placeholder,
    confirm_label = "OK",
    validate,
    select_stem = false,
    danger = false,
    resolve,
  }: DialogProps<string> & PromptOptions & { message: string } = $props();

  let value = $state(untrack(() => initial));
  let touched = $state(false);
  const error = $derived(touched ? (value.trim() === "" ? "Can't be empty." : (validate?.(value) ?? null)) : null);
  const invalid = $derived(value.trim() === "" || (validate?.(value) ?? null) !== null);

  const select_initial: Attachment<HTMLInputElement> = (input) => {
    input.focus();
    const dot = input.value.lastIndexOf(".");
    if (select_stem && dot > 0) input.setSelectionRange(0, dot);
    else input.select();
  };

  function submit(event: SubmitEvent) {
    event.preventDefault();
    touched = true;
    if (!invalid) resolve(value.trim());
  }
</script>

<form class="grid w-[min(24rem,calc(100vw-2rem))] gap-4 rounded-2xl bg-background-lighter p-5 shadow-popover" onsubmit={submit}>
  <div>
    <h2 class="text-sm font-semibold">{message}</h2>
    {#if detail}<p class="mt-0.5 text-ui text-foreground/65">{detail}</p>{/if}
  </div>

  <div class="grid gap-1.5">
    <Input
      bind:value
      {placeholder}
      size="lg"
      aria-label={message}
      aria-invalid={error !== null}
      spellcheck="false"
      oninput={() => (touched = true)}
      {@attach select_initial}
    />
    {#if error}<p class="text-2xs text-error" role="alert">{error}</p>{/if}
  </div>

  <div class="flex justify-end gap-2">
    <Button variant="quiet" onclick={() => resolve(null)}>Cancel</Button>
    <Button variant={danger ? "danger" : "primary"} type="submit" disabled={touched && invalid}>{confirm_label}</Button>
  </div>
</form>

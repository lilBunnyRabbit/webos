<script lang="ts">
  import { Button, Checkbox, EmptyState, Input, Spinner } from "$lib/core/components/ui";
  import { Camera as CameraIcon, Plus as PlusIcon } from "phosphor-svelte";
  import { history_key } from "./data";
  import { parse_entry } from "./parse";
  import { ReadMethod, type ReviewRow } from "./read-image";

  interface Props {
    /** `null` while the photo is being read. */
    rows: ReviewRow[] | null;
    method: ReadMethod;
    error: string | null;
    list_name: string;
    /** History keys open on the list: those lines update the item instead of adding another. */
    open_keys: ReadonlySet<string>;
    onadd: (lines: string[]) => void;
    oncancel: () => void;
    onretry: () => void;
  }

  let { rows = $bindable(), method, error, list_name, open_keys, onadd, oncancel, onretry }: Props = $props();

  const chosen = $derived((rows ?? []).filter((row) => row.keep && row.text.trim()).map((row) => row.text.trim()));
  const source = $derived(method === ReadMethod.AI ? "Read on this device by Gemini Nano." : "Read on this device by the text reader.");
</script>

<section aria-label="Lines from the photo" class="mx-auto flex h-full w-full max-w-md flex-col">
  {#if error}
    <EmptyState icon={CameraIcon} tone="error" title="Couldn't read the photo" description={error}>
      {#snippet actions()}
        <Button variant="quiet" onclick={oncancel}>Back to the list</Button>
        <Button variant="primary" onclick={onretry}>Try again</Button>
      {/snippet}
    </EmptyState>
  {:else if rows === null}
    <div class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <Spinner label="Reading" />
      <p class="text-sm">Reading the list…</p>
      <p class="text-ui text-foreground/65">{method === ReadMethod.AI ? "Gemini Nano reads it on this device." : "The first time, the text reader downloads about 17 MB."}</p>
      <Button variant="quiet" onclick={oncancel}>Cancel</Button>
    </div>
  {:else if rows.length === 0}
    <EmptyState icon={CameraIcon} title="No list in that photo" description="Fill the frame with the list, in good light, and try again.">
      {#snippet actions()}
        <Button variant="quiet" onclick={oncancel}>Back to the list</Button>
        <Button variant="primary" onclick={onretry}>Another photo</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="px-4 pt-4 pb-2">
      <p class="text-sm font-medium">Add to “{list_name}”</p>
      <p class="text-ui text-foreground/65">{source} Untick what's wrong, fix a line by tapping it.</p>
    </div>
    <ul class="flex min-h-0 flex-1 flex-col overflow-auto pr-4 pb-2 pl-1">
      {#each rows as row, index (index)}
        <li class="flex items-center gap-1">
          <label class="grid size-11 shrink-0 place-items-center">
            <Checkbox bind:checked={row.keep} aria-label="Add line {index + 1}" class="size-5" />
          </label>
          <Input bind:value={row.text} aria-label="Line {index + 1}" class={row.keep ? "" : "opacity-38"} />
          {#if open_keys.has(history_key(parse_entry(row.text).text))}
            <span class="shrink-0 text-2xs text-foreground/65">On the list</span>
          {/if}
        </li>
      {/each}
    </ul>
    <div class="flex items-center justify-end gap-2 border-t border-hairline bg-background-light px-4 py-3">
      <Button variant="quiet" onclick={oncancel}>Cancel</Button>
      <Button variant="primary" disabled={chosen.length === 0} onclick={() => onadd(chosen)}>
        <PlusIcon weight="bold" /> Add {chosen.length} {chosen.length === 1 ? "item" : "items"}
      </Button>
    </div>
  {/if}
</section>

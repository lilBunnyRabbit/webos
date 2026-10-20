<script lang="ts">
  import { Button, Checkbox, Spinner } from "$lib/core/components/ui";
  import { error_message } from "$lib/core/utils";
  import { QrFrames } from "$kit/components/qr-transfer";
  import { encode_frames } from "$kit/utils/qr-transfer";
  import { untrack } from "svelte";
  import type { List } from "./data";
  import ListMark from "./list-mark.svelte";
  import { live } from "./merge";
  import { share_of, SHARE_APP } from "./share";

  interface Props {
    lists: List[];
    /** Ticked to start with. */
    initial: string[];
    onclose: () => void;
  }

  let { lists, initial, onclose }: Props = $props();

  let picked = $state(new Set(untrack(() => initial)));
  let frames = $state<string[] | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  const chosen = $derived(lists.filter((list) => picked.has(list.id)));

  function toggle(id: string, on: boolean) {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    picked = next;
  }

  async function show() {
    busy = true;
    error = null;
    try {
      frames = await encode_frames(SHARE_APP, share_of(chosen));
    } catch (reason) {
      error = error_message(reason);
    } finally {
      busy = false;
    }
  }
</script>

<section aria-label="Share lists" class="mx-auto flex h-full w-full max-w-md flex-col">
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
    {#if frames}
      <div class="flex flex-col items-center gap-3 text-center">
        <p class="text-sm font-medium">On the other phone: Shopping List › Receive, then point it here</p>
        <QrFrames {frames} label="Share code for {chosen.map((list) => list.name).join(', ')}" />
        <p class="text-ui text-foreground/65">
          {frames.length === 1 ? "One code." : `${frames.length} codes, cycling: hold steady until the other phone has them all.`} Nothing changes there until it's reviewed.
        </p>
      </div>
    {:else}
      <div class="flex flex-col gap-1">
        <p class="text-sm font-medium">Which lists?</p>
        <p class="text-ui text-foreground/65">The other phone sees what would change and picks what to keep.</p>
      </div>
      <div class="flex flex-col">
        {#each lists as list (list.id)}
          <label class="flex min-h-12 items-center gap-3 rounded-lg px-1 hover:bg-foreground/4">
            <Checkbox checked={picked.has(list.id)} onchange={(event) => toggle(list.id, event.currentTarget.checked)} class="size-5" />
            <ListMark {list} size="md" />
            <span class="min-w-0 flex-1 truncate font-medium">{list.name}</span>
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">{live(list.items).length} {live(list.items).length === 1 ? "item" : "items"}</span>
          </label>
        {/each}
      </div>
      {#if error}<p class="text-ui text-error">{error}</p>{/if}
    {/if}
  </div>
  <div class="flex items-center justify-end gap-2 border-t border-foreground/8 bg-background-light px-4 py-3">
    {#if frames}
      <Button variant="quiet" onclick={() => (frames = null)}>Change lists</Button>
      <Button variant="primary" onclick={onclose}>Done</Button>
    {:else}
      <Button variant="quiet" onclick={onclose}>Cancel</Button>
      <Button variant="primary" disabled={chosen.length === 0 || busy} onclick={() => void show()}>
        {#if busy}<Spinner label="Making codes" />{/if} Show codes
      </Button>
    {/if}
  </div>
</section>

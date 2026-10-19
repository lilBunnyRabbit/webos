<script lang="ts">
  import { Button, IconButton, Input } from "$lib/core/components/ui";
  import { Camera as CameraIcon, ClockCounterClockwise as ClockCounterClockwiseIcon, Plus as PlusIcon } from "phosphor-svelte";
  import type { History } from "./data";
  import { entry_text, format_amount, parse_entry } from "./parse";
  import { last_trip, suggestions } from "./suggest";

  interface Props {
    history: History;
    /** History keys already open on the list: never suggested. */
    exclude: ReadonlySet<string>;
    onadd: (text: string) => void;
    onphoto: () => void;
  }

  let { history, exclude, onadd, onphoto }: Props = $props();

  let draft = $state("");
  let field = $state<HTMLInputElement | null>(null);

  const parsed = $derived(parse_entry(draft));
  const typing = $derived(draft.trim().length > 0);
  const chips = $derived(typing ? suggestions(history, parsed.text, exclude) : last_trip(history, exclude));
  const amount = $derived(format_amount(parsed));

  function add(text: string) {
    if (!parse_entry(text).text.trim()) return;
    onadd(text);
    draft = "";
    field?.focus();
  }

  /** A typed amount stays: "2x mle" and the "mleko" chip add "2x mleko". */
  function pick(name: string) {
    if (!typing) return onadd(name);
    add(entry_text({ ...parsed, text: name }));
  }
</script>

<div class="border-t border-foreground/8 bg-background-light">
  {#if chips.length > 0}
    <div class="flex items-center gap-1.5 overflow-x-auto px-3 pt-2 [scrollbar-width:none]" aria-label={typing ? "Suggestions" : "Buy again"} role="group">
      {#if !typing}
        <span class="flex shrink-0 items-center gap-1 text-2xs text-foreground/65 uppercase tracking-wide">
          <ClockCounterClockwiseIcon class="size-3.5" weight="bold" /> Again
        </span>
      {/if}
      {#each chips as name (name)}
        <Button size="sm" class="shrink-0 rounded-full" onclick={() => pick(name)}>
          {#if typing && amount}<span class="font-mono text-2xs text-foreground/65">{amount}</span>{/if}<span>{name}</span>
        </Button>
      {/each}
      {#if !typing && chips.length > 1}
        <Button size="sm" variant="quiet" class="shrink-0 rounded-full" onclick={() => chips.forEach((name) => onadd(name))}>
          <PlusIcon weight="bold" /> All {chips.length}
        </Button>
      {/if}
    </div>
  {/if}
  <form
    class="flex items-center gap-1.5 px-3 py-2"
    onsubmit={(event) => {
      event.preventDefault();
      add(draft);
    }}
  >
    <IconButton label="Read a list from a photo" size="md" onclick={onphoto}><CameraIcon weight="bold" /></IconButton>
    <Input
      bind:value={draft}
      bind:element={field}
      size="lg"
      class="flex-1"
      placeholder="Add an item, like 2x milk"
      aria-label="New item"
      enterkeyhint="done"
      autocomplete="off"
      onkeydown={(event) => {
        if (event.key === "Escape" && draft) {
          event.stopPropagation();
          draft = "";
        }
      }}
    />
    <Button type="submit" variant="primary" size="lg" disabled={!typing} class="px-3" aria-label="Add">
      <PlusIcon weight="bold" /><span class="hidden @xs:inline">Add</span>
    </Button>
  </form>
</div>

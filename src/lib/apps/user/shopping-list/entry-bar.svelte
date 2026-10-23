<script lang="ts">
  import { tick } from "svelte";
  import { Button, IconButton, Input } from "$lib/core/components/ui";
  import { Camera as CameraIcon, ClockCounterClockwise as ClockCounterClockwiseIcon, Plus as PlusIcon } from "phosphor-svelte";
  import type { Snippet } from "svelte";
  import type { History } from "./data";
  import { entry_text, format_amount, parse_entry } from "./parse";
  import { last_trip, suggestions } from "./suggest";

  interface Props {
    history: History;
    /** History keys already open on the list: never suggested. */
    exclude: ReadonlySet<string>;
    onadd: (text: string) => void;
    onphoto: () => void;
    /** Off in the store: a planning aid, and a stray tap there adds an item. Suggestions while typing stay. */
    again?: boolean;
    /** In the store: one "+ Add" button until tapped, so the list keeps the room. */
    compact?: boolean;
    /** Before the camera button, like All's list picker. */
    before?: Snippet;
  }

  let { history, exclude, onadd, onphoto, again = true, compact = false, before }: Props = $props();

  let draft = $state("");
  let field = $state<HTMLInputElement | null>(null);

  const parsed = $derived(parse_entry(draft));
  const typing = $derived(draft.trim().length > 0);
  const chips = $derived(typing ? suggestions(history, parsed.text, exclude) : again ? last_trip(history, exclude) : []);
  const amount = $derived(format_amount(parsed));
  let expanded = $state(false);
  const collapsed = $derived(compact && !expanded && !typing);

  async function expand() {
    expanded = true;
    await tick();
    field?.focus();
  }

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

<div class="border-t border-hairline bg-background-light">
  {#if chips.length > 0}
    <div class="mx-auto flex max-w-xl items-center gap-1.5 overflow-x-auto px-3 pt-2 [scrollbar-width:none]" aria-label={typing ? "Suggestions" : "Buy again"} role="group">
      {#if !typing}
        <span class="flex shrink-0 items-center gap-1 text-2xs text-foreground/65 uppercase tracking-wide">
          <ClockCounterClockwiseIcon class="size-3.5" weight="bold" /> Again
        </span>
      {/if}
      {#each chips as name (name)}
        <Button size="md" class="shrink-0 rounded-full" onclick={() => pick(name)}>
          {#if typing && amount}<span class="font-mono text-2xs text-foreground/65">{amount}</span>{/if}<span>{name}</span>
        </Button>
      {/each}
      {#if !typing && chips.length > 1}
        <Button size="md" variant="quiet" class="shrink-0 rounded-full" onclick={() => chips.forEach((name) => onadd(name))}>
          <PlusIcon weight="bold" /> All {chips.length}
        </Button>
      {/if}
    </div>
  {/if}
  {#if collapsed}
    <div class="mx-auto flex max-w-xl items-center gap-1.5 px-3 py-1.5">
      {@render before?.()}
      <Button size="lg" variant="quiet" class="flex-1 justify-center pointer-coarse:h-11" onclick={() => void expand()}><PlusIcon weight="bold" /> Add</Button>
    </div>
  {:else}
    <form
      class="mx-auto flex max-w-xl items-center gap-1.5 px-3 py-2"
      onsubmit={(event) => {
        event.preventDefault();
        add(draft);
      }}
    >
      {@render before?.()}
      <IconButton label="Read a list from a photo" size="lg" class="pointer-coarse:size-11" onclick={onphoto}><CameraIcon weight="bold" /></IconButton>
      <Input
        bind:value={draft}
        bind:element={field}
        size="lg"
        class="flex-1 pointer-coarse:h-11"
        placeholder="Add, like 2x milk"
        aria-label="New item"
        enterkeyhint="done"
        autocomplete="off"
        onkeydown={(event) => {
          if (event.key === "Escape" && draft) {
            event.stopPropagation();
            draft = "";
          }
        }}
        onblur={() => {
          if (!draft.trim()) expanded = false;
        }}
      />
      <Button type="submit" variant="primary" size="lg" disabled={!typing} class="px-3 pointer-coarse:h-11" aria-label="Add">
        <PlusIcon weight="bold" /><span class="hidden @xs:inline">Add</span>
      </Button>
    </form>
  {/if}
</div>

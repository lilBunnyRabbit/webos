<script lang="ts">
  import { Button, IconButton, Input } from "$lib/core/components/ui";
  import { CaretDown as CaretDownIcon, CaretUp as CaretUpIcon, TextAa as TextAaIcon, X as XIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import type { WarrenEditor } from "./editor.svelte";
  import type { Match } from "./lexical";

  interface Props {
    editor: WarrenEditor;
    input_id: string;
    onclose: () => void;
    onreplaced: (count: number, query: string) => void;
  }

  let { editor, input_id, onclose, onreplaced }: Props = $props();
  const uid = $props.id();

  let query = $state("");
  let replacement = $state("");
  let whole = $state(false);

  const matches = $derived.by(() => {
    void editor.json;
    return query ? editor.find(query, whole) : [];
  });
  // A new query or Whole word starts at the match after the cursor; stepping and replacing then move it. Edits don't.
  let current = $derived.by(() => {
    void query;
    void whole;
    return untrack(() => Math.max(0, editor.next_after_selection(matches)));
  });
  const index = $derived(matches.length ? Math.min(current, matches.length - 1) : -1);
  const status = $derived(!query ? "" : matches.length ? `${index + 1} of ${matches.length}` : "No results");

  const all_name = `warren-find-${uid}`;
  const current_name = `warren-find-current-${uid}`;
  const HIGHLIGHT_CSS =
    `::highlight(${all_name}){background-color:color-mix(in oklch,var(--primary) 22%,transparent)}` +
    `::highlight(${current_name}){background-color:color-mix(in oklch,var(--primary) 50%,transparent)}`;

  function range_of(match: Match): Range | null {
    const element = editor.element_of(match);
    if (!element) return null;
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
    if (!(text instanceof Text) || text.length < match.end) return null;
    const range = new Range();
    range.setStart(text, match.start);
    range.setEnd(text, match.end);
    return range;
  }

  // The Custom Highlight API paints matches without touching the document, so Lexical never sees them.
  $effect(() => {
    const others = new Highlight();
    const now = new Highlight();
    matches.forEach((match, at) => {
      const range = range_of(match);
      if (range) (at === index ? now : others).add(range);
    });
    CSS.highlights.set(all_name, others);
    CSS.highlights.set(current_name, now);
    return () => {
      CSS.highlights.delete(all_name);
      CSS.highlights.delete(current_name);
    };
  });

  function reveal(at: number) {
    current = at;
    const match = matches[at];
    if (match) editor.element_of(match)?.scrollIntoView({ block: "center", inline: "nearest" });
  }

  function step(direction: 1 | -1) {
    if (!matches.length) return;
    reveal((index + direction + matches.length) % matches.length);
  }

  function replace_one() {
    const match = matches[index];
    if (!match) return;
    editor.replace_match(match, query, replacement);
    const end = match.start + replacement.length;
    current = index + matches.filter((next) => next.key === match.key && next.start >= match.start && next.start < end).length;
  }

  function replace_every() {
    if (!query) return;
    onreplaced(editor.replace_all(query, replacement, whole), query);
  }

  function close() {
    const match = matches[index];
    onclose();
    if (match) editor.select_match(match);
    else editor.focus();
  }

  function keys(event: KeyboardEvent, enter: () => void) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      enter();
    }
  }
</script>

<svelte:element this={"style"}>{HIGHLIGHT_CSS}</svelte:element>

<div class="flex shrink-0 flex-wrap items-center gap-1 border-b border-hairline bg-background-light px-2 py-1.5" role="search" aria-label="Find and replace">
  <Input
    id={input_id}
    size="sm"
    class="min-w-0 flex-1"
    placeholder="Find"
    aria-label="Find"
    autocomplete="off"
    spellcheck="false"
    bind:value={query}
    {@attach (element) => element.focus()}
    onkeydown={(event) => keys(event, () => step(event.shiftKey ? -1 : 1))}
  />
  <span class="w-16 shrink-0 text-center font-mono text-2xs text-foreground/65 tabular-nums" aria-live="polite">{status}</span>
  <IconButton label="Previous (Shift+Enter)" size="sm" disabled={!matches.length} onclick={() => step(-1)}><CaretUpIcon weight="bold" /></IconButton>
  <IconButton label="Next (Enter)" size="sm" disabled={!matches.length} onclick={() => step(1)}><CaretDownIcon weight="bold" /></IconButton>
  <IconButton label="Whole words only" size="sm" pressed={whole} onclick={() => (whole = !whole)}><TextAaIcon weight="bold" /></IconButton>
  <IconButton label="Close (Esc)" size="sm" onclick={close}><XIcon weight="bold" /></IconButton>
  <div class="flex basis-full items-center gap-1">
    <Input
      size="sm"
      class="min-w-0 flex-1"
      placeholder="Replace with"
      aria-label="Replace with"
      autocomplete="off"
      bind:value={replacement}
      onkeydown={(event) => keys(event, replace_one)}
    />
    <Button size="sm" disabled={index < 0} onclick={replace_one}>Replace</Button>
    <Button size="sm" disabled={index < 0} onclick={replace_every}>All</Button>
  </div>
</div>

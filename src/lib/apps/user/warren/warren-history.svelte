<script lang="ts">
  import { Button, Grabber, IconButton, Segmented, Spinner } from "$lib/core/components/ui";
  import { error_message, format_datetime } from "$lib/core/utils";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, CaretLeft as CaretLeftIcon, ClockCounterClockwise as ClockCounterClockwiseIcon, X as XIcon } from "phosphor-svelte";
  import type { WarrenDocument } from "./format";
  import { DiffKind, diff_paragraphs, paragraphs_of, type Snapshot } from "./history";
  import { list_snapshots, read_snapshot } from "./history-files";
  import { blocks_html, document_css, type Families } from "./print";
  import { resolve_styles } from "./styles";

  interface Props {
    doc_id: string | null;
    current: () => WarrenDocument;
    sheet: boolean;
    families: Families;
    paper: string;
    onrestore: (document: WarrenDocument, snapshot: Snapshot) => void;
    onclose: () => void;
  }

  let { doc_id, current, sheet, families, paper, onrestore, onclose }: Props = $props();

  type View = "preview" | "compare";

  let snapshots = $state.raw<Snapshot[] | null>(null);
  let failure = $state("");
  let picked = $state.raw<{ snapshot: Snapshot; document: WarrenDocument | null; error: string } | null>(null);
  let view = $state<View>("preview");

  const VIEW_OPTIONS: { value: View; label: string }[] = [
    { value: "preview", label: "Preview" },
    { value: "compare", label: "Compare" },
  ];

  $effect(() => {
    const id = doc_id;
    if (!id) {
      snapshots = [];
      return;
    }
    let stale = false;
    list_snapshots(id)
      .then((list) => !stale && (snapshots = list))
      .catch((reason) => !stale && (failure = error_message(reason)));
    return () => (stale = true);
  });

  async function pick(snapshot: Snapshot) {
    if (!doc_id) return;
    picked = { snapshot, document: null, error: "" };
    try {
      const document = await read_snapshot(doc_id, snapshot);
      if (picked?.snapshot === snapshot) picked = { snapshot, document, error: "" };
    } catch (reason) {
      if (picked?.snapshot === snapshot) picked = { snapshot, document: null, error: error_message(reason) };
    }
  }

  const css = $derived(picked?.document ? document_css(".wr-preview", resolve_styles(picked.document.styles), families) : "");
  const diff = $derived(picked?.document && view === "compare" ? diff_paragraphs(paragraphs_of(picked.document.editor), paragraphs_of(current().editor)) : []);
  const changes = $derived(diff.filter((line) => line.kind !== DiffKind.SAME).length);

  function on_key(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    if (picked) picked = null;
    else onclose();
  }
</script>

<svelte:element this={"style"}>{css}</svelte:element>

{#snippet header()}
  <div class="flex h-11 shrink-0 items-center gap-1 border-b border-foreground/8 px-2">
    {#if picked}
      <IconButton label="All versions" size="sm" class="pointer-coarse:size-11" onclick={() => (picked = null)}><CaretLeftIcon weight="bold" /></IconButton>
      <h2 class="min-w-0 flex-1 truncate text-ui font-semibold">{format_datetime(picked.snapshot.at)}</h2>
    {:else}
      <h2 class="min-w-0 flex-1 truncate pl-1 text-ui font-semibold">Version history</h2>
    {/if}
    {#if !sheet}
      <IconButton label="Close (Esc)" size="sm" onclick={onclose}><XIcon weight="bold" /></IconButton>
    {/if}
  </div>
{/snippet}

{#snippet body()}
  {#if picked}
    <div class="flex shrink-0 items-center gap-2 px-3 py-2">
      <Segmented size="sm" label="Show" options={VIEW_OPTIONS} bind:value={view} />
      <span class="ml-auto font-mono text-2xs text-foreground/65 tabular-nums">{picked.snapshot.words.toLocaleString("en")} words</span>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto bg-background-darker p-3">
      {#if picked.error}
        <p class="text-ui text-error">{picked.error}</p>
      {:else if !picked.document}
        <div class="grid place-items-center py-8"><Spinner label="Opening that version" /></div>
      {:else if view === "preview"}
        <div class="rounded-sm bg-(--background-lightest) px-5 py-4 text-foreground shadow-sm" style={paper}>
          <div class="wr-preview" inert>{@html blocks_html(picked.document.editor)}</div>
        </div>
      {:else}
        <p class="mb-2 text-2xs text-foreground/65">
          {changes ? `${changes} ${changes === 1 ? "paragraph differs" : "paragraphs differ"} from what's open now.` : "Same text as what's open now."}
          <span class="text-error">Struck</span> is only in this version, <span class="text-success">marked</span> only now.
        </p>
        <ol class="flex flex-col gap-1 text-ui">
          {#each diff as line, index (index)}
            <li
              class={[
                "rounded-md px-2 py-1 break-words",
                line.kind === DiffKind.REMOVED && "bg-error/12 text-foreground/80 line-through decoration-error/60",
                line.kind === DiffKind.ADDED && "bg-success/12",
                line.kind === DiffKind.SAME && "text-foreground/65",
              ]}
            >
              <span class="sr-only">{line.kind === DiffKind.REMOVED ? "Only in this version: " : line.kind === DiffKind.ADDED ? "Only now: " : ""}</span>{line.text}
            </li>
          {/each}
        </ol>
      {/if}
    </div>
    <div class="flex shrink-0 justify-end gap-2 border-t border-foreground/8 p-2">
      <Button disabled={!picked.document} variant="primary" onclick={() => picked?.document && onrestore(picked.document, picked.snapshot)}>
        <ArrowCounterClockwiseIcon weight="bold" />Restore this version
      </Button>
    </div>
  {:else}
    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if failure}
        <p class="p-3 text-ui text-error">{failure}</p>
      {:else if snapshots === null}
        <div class="grid place-items-center py-8"><Spinner label="Reading the history" /></div>
      {:else if !snapshots.length}
        <div class="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <ClockCounterClockwiseIcon class="size-8 text-foreground/40" weight="duotone" />
          <p class="text-ui text-foreground/80">No versions yet</p>
          <p class="text-2xs text-foreground/65">Warren keeps one each time you save, and every few minutes while you write in a saved document.</p>
        </div>
      {:else}
        <ul class="flex flex-col p-1.5">
          {#each snapshots as snapshot (snapshot.name)}
            <li>
              <button
                type="button"
                class="flex h-10 w-full items-center gap-2 rounded-md px-2 text-left text-ui hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none pointer-coarse:h-12"
                onclick={() => pick(snapshot)}
              >
                <span class="min-w-0 flex-1 truncate">{format_datetime(snapshot.at)}</span>
                <span class="font-mono text-2xs text-foreground/65 tabular-nums">{snapshot.words.toLocaleString("en")} words</span>
              </button>
            </li>
          {/each}
        </ul>
        <p class="px-3 pb-3 text-2xs text-foreground/65">All of today's versions are kept, then one a day for a month, then one a week.</p>
      {/if}
    </div>
  {/if}
{/snippet}

{#if sheet}
  <div class="absolute inset-0 z-20 flex flex-col justify-end">
    <button type="button" tabindex="-1" aria-label="Close" class="absolute inset-0 bg-(--overlay)" onclick={onclose}></button>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      tabindex="-1"
      class="relative mx-auto flex h-[85%] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-background-light shadow-raised ring-1 ring-foreground/10 outline-none motion-safe:animate-sheet-in"
      {@attach (element) => element.focus({ preventScroll: true })}
      {@attach swipe_dismiss({ on_dismiss: onclose })}
      onkeydown={on_key}
    >
      <Grabber class="mt-2 mb-1" />
      {@render header()}
      {@render body()}
    </div>
  </div>
{:else}
  <div
    role="dialog"
    aria-label="Version history"
    tabindex="-1"
    class="absolute inset-y-0 right-0 z-20 flex w-[min(26rem,100%)] flex-col border-l border-foreground/10 bg-background-light shadow-raised outline-none motion-safe:animate-in motion-safe:slide-in-from-right"
    {@attach (element) => element.focus({ preventScroll: true })}
    onkeydown={on_key}
  >
    {@render header()}
    {@render body()}
  </div>
{/if}

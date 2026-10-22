<script lang="ts">
  import { Button, IconButton } from "$lib/core/components/ui";
  import { format_datetime } from "$lib/core/utils";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, Check as CheckIcon, ChatTeardropText as ChatTeardropTextIcon, PencilSimple as PencilSimpleIcon, Trash as TrashIcon } from "phosphor-svelte";
  import type { WarrenEditor } from "./editor.svelte";
  import type { Comment } from "./format";
  import { mark_ids } from "./model";

  interface Props {
    editor: WarrenEditor;
    oncomment: () => void;
    onshow: (id: string) => void;
    onedit: (comment: Comment) => void;
    ondelete: (comment: Comment) => void;
  }

  let { editor, oncomment, onshow, onedit, ondelete }: Props = $props();

  const order = $derived(mark_ids(editor.json));
  const anchored = $derived(new Set(order));
  const sorted = $derived(
    [...editor.comments].sort((a, b) => {
      const at = (comment: Comment) => (order.includes(comment.id) ? order.indexOf(comment.id) : Infinity);
      return at(a) - at(b) || a.created - b.created;
    })
  );
  const open = $derived(sorted.filter((comment) => !comment.resolved));
  const resolved = $derived(sorted.filter((comment) => comment.resolved));
  let show_resolved = $state(false);
</script>

{#snippet item(comment: Comment)}
  {@const here = anchored.has(comment.id)}
  <li class={["flex flex-col gap-1 rounded-lg p-2 ring-1", editor.comments_here.includes(comment.id) ? "bg-warning/12 ring-warning/40" : "ring-foreground/8"]}>
    <button
      type="button"
      class="min-h-8 rounded-md text-left focus-visible:bg-primary/12 focus-visible:outline-none disabled:cursor-default pointer-coarse:min-h-11"
      disabled={!here}
      title={here ? "Show the text it's on" : undefined}
      onclick={() => onshow(comment.id)}
    >
      <span class={["line-clamp-2 border-l-2 pl-1.5 text-2xs italic", here ? "border-warning text-foreground/80" : "border-foreground/20 text-foreground/65 line-through"]}>{comment.quote}</span>
      <span class="mt-1 block text-ui break-words whitespace-pre-wrap">{comment.text}</span>
    </button>
    <div class="flex items-center gap-0.5">
      <span class="min-w-0 flex-1 truncate text-2xs text-foreground/65">{here ? format_datetime(comment.created) : "Its text is gone"}</span>
      <IconButton label="Edit" size="sm" class="pointer-coarse:size-11" onclick={() => onedit(comment)}><PencilSimpleIcon weight="bold" /></IconButton>
      {#if comment.resolved}
        <IconButton label="Reopen" size="sm" class="pointer-coarse:size-11" onclick={() => editor.set_comment(comment.id, { resolved: false })}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
      {:else}
        <IconButton label="Resolve" size="sm" class="pointer-coarse:size-11" onclick={() => editor.set_comment(comment.id, { resolved: true })}><CheckIcon weight="bold" /></IconButton>
      {/if}
      <IconButton label="Delete" size="sm" class="pointer-coarse:size-11" onclick={() => ondelete(comment)}><TrashIcon weight="bold" /></IconButton>
    </div>
  </li>
{/snippet}

<Button size="sm" disabled={!editor.selected.trim()} onpointerdown={(event) => event.preventDefault()} onclick={oncomment}><ChatTeardropTextIcon weight="bold" />Comment on the selection</Button>
{#if !editor.comments.length}
  <p class="text-2xs text-foreground/65">Select text and comment on it. Comments are saved in the document and go to Word with it; they don't print.</p>
{:else}
  {#if open.length}
    <ul class="flex flex-col gap-1.5" aria-label="Comments">
      {#each open as comment (comment.id)}{@render item(comment)}{/each}
    </ul>
  {:else}
    <p class="text-2xs text-foreground/65">Every comment is resolved.</p>
  {/if}
  {#if resolved.length}
    <Button size="sm" variant="quiet" aria-expanded={show_resolved} onclick={() => (show_resolved = !show_resolved)}>{show_resolved ? "Hide" : "Show"} {resolved.length} resolved</Button>
    {#if show_resolved}
      <ul class="flex flex-col gap-1.5 opacity-80" aria-label="Resolved comments">
        {#each resolved as comment (comment.id)}{@render item(comment)}{/each}
      </ul>
    {/if}
  {/if}
{/if}

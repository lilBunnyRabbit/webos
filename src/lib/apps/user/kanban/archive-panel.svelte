<script lang="ts">
  import { Button, EmptyState, IconButton } from "$lib/core/components/ui";
  import { format_date } from "$lib/core/utils";
  import { Archive, ArrowCounterClockwise, Trash, X } from "phosphor-svelte";
  import CardFace from "./card-face.svelte";
  import type { Board } from "./data";

  interface Props {
    board: Board;
    today: string;
    onclose: () => void;
    onrestore: (card_id: string) => void;
    ondelete: (card_id: string | null) => void;
  }

  let { board, today, onclose, onrestore, ondelete }: Props = $props();

  const column_name = (id: string) => board.columns.find((column) => column.id === id)?.name ?? "a deleted column";
</script>

<div class="flex h-full min-h-0 flex-col">
  <header class="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-2">
    <IconButton label="Close" size="sm" onclick={onclose}><X weight="bold" /></IconButton>
    <h2 class="flex-1 truncate text-ui font-semibold">Archive</h2>
    {#if board.archive.length > 0}
      <Button variant="quiet" size="sm" onclick={() => ondelete(null)}><Trash />Empty</Button>
    {/if}
  </header>
  {#if board.archive.length === 0}
    <EmptyState icon={Archive} title="Nothing archived" description="Archive a card from its menu, or clear out the done column from the board menu." />
  {:else}
    <ol class="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto p-2">
      {#each board.archive as card (card.id)}
        <li class="grid gap-2 rounded-lg bg-background-light p-2.5 shadow-raised">
          <CardFace {card} labels={board.labels} {today} done />
          <div class="flex items-center gap-1">
            <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/55">{format_date(new Date(card.archived))} · from {column_name(card.column)}</span>
            <IconButton label="Restore" size="sm" onclick={() => onrestore(card.id)}><ArrowCounterClockwise /></IconButton>
            <IconButton label="Delete for good" size="sm" onclick={() => ondelete(card.id)}><Trash /></IconButton>
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</div>

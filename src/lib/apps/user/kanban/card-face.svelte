<script lang="ts">
  import { Badge } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { CalendarBlank, CheckSquare, TextAlignLeft } from "phosphor-svelte";
  import { checklist_progress, due_state, type Card, type Label } from "./data";
  import { describe_due, DUE_TONE, LABEL_CHIP } from "./view";

  let { card, labels, today, done = false }: { card: Card; labels: Label[]; today: string; done?: boolean } = $props();

  const card_labels = $derived(labels.filter((label) => card.labels.includes(label.id)));
  const progress = $derived(checklist_progress(card));
</script>

<span class="grid gap-1.5">
  {#if card_labels.length > 0}
    <span class="flex flex-wrap gap-1">
      {#each card_labels as label (label.id)}
        <span class={cn("inline-flex h-4.5 items-center rounded-sm px-1.5 text-2xs font-medium", LABEL_CHIP[label.color])}>{label.name}</span>
      {/each}
    </span>
  {/if}
  <span class={cn("text-ui leading-snug break-words", done && "text-foreground/60")}>{card.title || "Untitled"}</span>
  {#if card.due || progress.total > 0 || card.notes.trim()}
    <span class="flex flex-wrap items-center gap-1.5 text-foreground/60">
      {#if card.due}
        <Badge tone={done ? "neutral" : DUE_TONE[due_state(card.due, today)]}><CalendarBlank />{describe_due(card.due, today)}</Badge>
      {/if}
      {#if progress.total > 0}
        <Badge tone={progress.done === progress.total ? "success" : "neutral"}>
          <CheckSquare /><span class="font-mono tabular-nums">{progress.done}/{progress.total}</span>
        </Badge>
      {/if}
      {#if card.notes.trim()}
        <TextAlignLeft class="size-3.5" aria-label="Has notes" />
      {/if}
    </span>
  {/if}
</span>

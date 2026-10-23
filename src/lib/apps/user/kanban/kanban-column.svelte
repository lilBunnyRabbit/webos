<script lang="ts">
  import { Badge, Button, IconButton, Input } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import type { Position } from "$lib/core/utils/type";
  import { CheckCircle, DotsThree, Plus } from "phosphor-svelte";
  import CardFace from "./card-face.svelte";
  import { is_over_wip, type Column, type Label } from "./data";
  import { DragKind, type BoardDrag } from "./drag.svelte";
  import type { CardField } from "./folder";

  interface Props {
    column: Column;
    labels: Label[];
    today: string;
    drag: BoardDrag;
    composing: boolean;
    oncompose: (open: boolean) => void;
    onadd: (title: string) => void;
    onopen: (card_id: string) => void;
    oncardmenu: (card_id: string, point: Position) => void;
    onmenu: (point: Position) => void;
    /** Alt+arrows on a focused card: `dx` columns over, `dy` places up or down. */
    onkeymove: (card_id: string, dx: number, dy: number) => void;
    fields?: (card_id: string) => CardField[];
  }

  let { column, labels, today, drag, composing, oncompose, onadd, onopen, oncardmenu, onmenu, onkeymove, fields }: Props = $props();

  let title = $state("");

  const count = $derived(column.cards.length);
  const at_limit = $derived(column.wip !== null && count === column.wip);
  const over = $derived(is_over_wip(column));

  /** Hides the line where a drop would change nothing: right where the card already is. */
  const indicator = $derived.by(() => {
    const target = drag.target;
    if (drag.kind !== DragKind.CARD || !target || target.column !== column.id) return undefined;
    const from = column.cards.findIndex((card) => card.id === drag.id);
    if (from >= 0) {
      const next = column.cards[from + 1]?.id ?? null;
      if (target.before === next) return undefined;
    }
    return target.before;
  });

  function menu_point(point: Position, element: HTMLElement): Position {
    if (point.x || point.y) return point;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + 16, y: rect.top + 16 };
  }

  function on_card_key(event: KeyboardEvent, card_id: string) {
    if (!event.altKey) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onkeymove(card_id, ...move);
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const text = title.trim();
    if (!text) return;
    onadd(text);
    title = "";
  }

  function focus_on_mount(element: HTMLElement) {
    element.focus();
  }
</script>

<section
  data-column={column.id}
  aria-label={column.name}
  class={cn(
    "flex max-h-full w-[calc(100cqw-3rem)] shrink-0 flex-col rounded-xl bg-field shadow-recessed ring-1 ring-hairline ring-inset @md:w-72",
    drag.kind === DragKind.COLUMN && drag.id === column.id && "opacity-40"
  )}
>
  <header
    class="flex h-11 shrink-0 cursor-grab touch-pan-x items-center gap-2 pr-1.5 pl-3 select-none active:cursor-grabbing"
    {@attach drag.mouse(DragKind.COLUMN, () => column.id)}
    {@attach drag.touch(DragKind.COLUMN, () => column.id, (point, element) => onmenu(menu_point(point, element)))}
  >
    {#if column.done}<CheckCircle class="size-4 shrink-0 text-success" weight="fill" aria-label="Done column" />{/if}
    <h2 class="min-w-0 truncate text-ui font-semibold">{column.name}</h2>
    <Badge tone={over ? "error" : at_limit ? "warning" : "neutral"} class="font-mono tabular-nums">
      {count}{column.wip !== null ? `/${column.wip}` : ""}
    </Badge>
    <span class="flex-1"></span>
    <IconButton label="Column actions" size="sm" onclick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      onmenu({ x: rect.left, y: rect.bottom + 4 });
    }}>
      <DotsThree weight="bold" />
    </IconButton>
  </header>

  <ol data-column-list class="flex min-h-12 flex-col gap-1.5 overflow-y-auto px-2 pb-1">
    {#each column.cards as card (card.id)}
      {#if indicator === card.id}<li class="relative h-0" aria-hidden="true"><span class="absolute inset-x-1 -top-1 h-0.5 rounded-full bg-primary"></span></li>{/if}
      <li data-card={card.id}>
        <button
          type="button"
          class={cn(
            "w-full cursor-grab touch-manipulation rounded-lg bg-background-light p-2.5 text-left shadow-raised ring-1 ring-hairline select-none",
            "transition-[background-color,opacity] duration-150 hover:bg-background-lighter",
            "focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none active:cursor-grabbing",
            drag.kind === DragKind.CARD && drag.id === card.id && "opacity-40"
          )}
          aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
          onclick={() => onopen(card.id)}
          onkeydown={(event) => on_card_key(event, card.id)}
          {@attach drag.mouse(DragKind.CARD, () => card.id)}
          {@attach drag.touch(DragKind.CARD, () => card.id, (point, element) => oncardmenu(card.id, menu_point(point, element)))}
        >
          <CardFace {card} {labels} {today} done={column.done} fields={fields?.(card.id)} />
        </button>
      </li>
    {/each}
    {#if indicator === null}<li class="relative h-0" aria-hidden="true"><span class="absolute inset-x-1 -top-0.5 h-0.5 rounded-full bg-primary"></span></li>{/if}
    {#if column.cards.length === 0 && !composing}
      <li class="grid h-12 place-items-center rounded-lg border border-dashed border-hairline text-2xs text-foreground/45">
        {column.done ? "Finished cards land here" : "Drop cards here"}
      </li>
    {/if}
  </ol>

  <div class="shrink-0 p-2 pt-1">
    {#if composing}
      <form class="grid gap-1.5" onsubmit={submit}>
        <Input
          bind:value={title}
          size="sm"
          placeholder="What needs doing?"
          aria-label="New card in {column.name}"
          {@attach focus_on_mount}
          onkeydown={(event) => event.key === "Escape" && oncompose(false)}
          onblur={() => !title.trim() && oncompose(false)}
        />
        <div class="flex gap-1.5">
          <Button variant="primary" size="sm" type="submit" disabled={!title.trim()}>Add card</Button>
          <Button variant="quiet" size="sm" onclick={() => oncompose(false)}>Cancel</Button>
        </div>
      </form>
    {:else}
      <Button variant="quiet" size="sm" class="w-full justify-start text-foreground/65" onclick={() => oncompose(true)}><Plus weight="bold" />Add card</Button>
    {/if}
  </div>
</section>

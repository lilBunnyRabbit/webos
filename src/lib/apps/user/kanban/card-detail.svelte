<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import { Badge, Button, Checkbox, IconButton, Input, Segmented, Select, Textarea } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn, format_datetime } from "$lib/core/utils";
  import { long_press } from "$lib/core/utils/long-press";
  import type { Position } from "$lib/core/utils/type";
  import { Archive, PencilSimple, Plus, Trash, X } from "phosphor-svelte";
  import { untrack } from "svelte";
  import {
    add_check,
    add_label,
    checklist_progress,
    due_state,
    find_card,
    LABEL_COLORS,
    move_card,
    remove_check,
    remove_label,
    toggle_label,
    update_card,
    update_check,
    update_label,
    type Board,
    type Card,
    type Label,
  } from "./data";
  import { TextDraft } from "./draft.svelte";
  import MarkdownView from "./markdown-view.svelte";
  import { describe_due, DUE_TONE, LABEL_CHIP, LABEL_COLOR_NAMES, LABEL_DOT } from "./view";

  interface Props {
    board: Board;
    card_id: string;
    today: string;
    edit: (update: (board: Board) => Board) => void;
    onclose: () => void;
    onarchive: () => void;
    ondelete: () => void;
  }

  let { board, card_id, today, edit, onclose, onarchive, ondelete }: Props = $props();

  const { window: win } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const found = $derived(find_card(board, card_id));
  const NotesMode = { WRITE: "write", PREVIEW: "preview" } as const;
  type NotesMode = (typeof NotesMode)[keyof typeof NotesMode];
  let mode = $state<NotesMode>(untrack(() => found?.card.notes.trim()) ? NotesMode.PREVIEW : NotesMode.WRITE);
  let new_check = $state("");

  const change = (update: (card: Card) => Card) => edit((board) => update_card(board, card_id, update));

  // Typing writes the whole boards file, so text fields save after a pause. Keys carry the card (and item) they edit.
  const title = new TextDraft(async (id, text) => edit((board) => update_card(board, id, (card) => ({ ...card, title: text }))));
  const notes = new TextDraft(async (id, text) => edit((board) => update_card(board, id, (card) => ({ ...card, notes: text }))));
  const check_text = new TextDraft(async (key, text) => {
    const [id, item_id] = key.split(" ");
    edit((board) => update_card(board, id, (card) => update_check(card, item_id, { text })));
  });
  $effect(() => () => {
    title.flush();
    notes.flush();
    check_text.flush();
  });

  function add_item(event: SubmitEvent) {
    event.preventDefault();
    const text = new_check.trim();
    if (!text) return;
    change((card) => add_check(card, text));
    new_check = "";
  }

  async function new_label() {
    const name = await win.prompt("New label", { placeholder: "Errand, Home, Money…", confirm_label: "Create" });
    if (!name?.trim()) return;
    edit((board) => {
      const next = add_label(board, name.trim());
      return update_card(next, card_id, (card) => toggle_label(card, next.labels.at(-1)!.id));
    });
  }

  async function label_menu(label: Label, anchor: Position) {
    const choice = await dialogs.menu(
      [
        { id: "rename", label: "Rename…", icon: PencilSimple },
        {
          label: "Colour",
          items: LABEL_COLORS.map((color) => ({ id: `color:${color}`, label: LABEL_COLOR_NAMES[color], disabled: color === label.color })),
        },
        { separator: true },
        { id: "delete", label: "Delete label", icon: Trash, danger: true },
      ],
      { anchor }
    );
    if (choice === "rename") {
      const name = await win.prompt("Rename label", { initial: label.name, confirm_label: "Rename" });
      if (name?.trim()) edit((board) => update_label(board, label.id, { name: name.trim() }));
    } else if (choice?.startsWith("color:")) {
      edit((board) => update_label(board, label.id, { color: choice.slice(6) as Label["color"] }));
    } else if (choice === "delete") {
      const ok = await win.confirm(`Delete the label “${label.name}”?`, { detail: "It comes off every card on this board.", confirm_label: "Delete", danger: true });
      if (ok) edit((board) => remove_label(board, label.id));
    }
  }

  const column_options = $derived(board.columns.map((column) => ({ value: column.id, label: column.name })));
</script>

{#if found}
  {@const { card, column } = found}
  {@const progress = checklist_progress(card)}
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-2">
      <IconButton label="Close" size="sm" onclick={onclose}><X weight="bold" /></IconButton>
      <Select
        size="sm"
        class="w-auto max-w-44"
        aria-label="Column"
        options={column_options}
        bind:value={() => column.id, (to) => edit((board) => move_card(board, card_id, to, Infinity))}
      />
      <span class="flex-1"></span>
      <IconButton label="Archive card" size="sm" onclick={onarchive}><Archive /></IconButton>
      <IconButton label="Delete card" size="sm" onclick={ondelete}><Trash /></IconButton>
    </header>

    <div class="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 py-4">
      <textarea
        rows="1"
        value={title.value(card_id, card.title)}
        oninput={(event) => title.edit(card_id, event.currentTarget.value.replace(/\n/g, " "))}
        onkeydown={(event) => event.key === "Enter" && event.preventDefault()}
        placeholder="Card title"
        aria-label="Title"
        class="field-sizing-content min-h-[calc(1lh+0.25rem)] w-full resize-none rounded-md bg-transparent px-1 py-0.5 text-base font-semibold text-foreground placeholder:text-foreground/45 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none"
      ></textarea>

      <section class="grid gap-2" aria-label="Labels">
        <h3 class="text-2xs tracking-wide text-foreground/65 uppercase">Labels</h3>
        <div class="flex flex-wrap gap-1.5">
          {#each board.labels as label (label.id)}
            {@const on = card.labels.includes(label.id)}
            <button
              type="button"
              aria-pressed={on}
              title="Right-click to rename, recolour or delete"
              class={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-2xs font-medium transition-colors pointer-coarse:h-9",
                "focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none",
                on ? cn(LABEL_CHIP[label.color], "shadow-pressed") : "bg-raised text-foreground/70 shadow-control ring-1 ring-hairline hover:bg-raised-hover hover:text-foreground"
              )}
              onclick={() => change((card) => toggle_label(card, label.id))}
              {@attach long_press({ on_menu: (point) => label_menu(label, point) })}
            >
              <span class={cn("size-2 rounded-full", LABEL_DOT[label.color])}></span>{label.name}
            </button>
          {/each}
          <Button variant="quiet" size="sm" onclick={new_label}><Plus weight="bold" />Label</Button>
        </div>
      </section>

      <section class="grid gap-2" aria-label="Due date">
        <h3 class="text-2xs tracking-wide text-foreground/65 uppercase">Due</h3>
        <div class="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            size="sm"
            class="w-40"
            aria-label="Due date"
            value={card.due ?? ""}
            onchange={(event) => {
              const due = event.currentTarget.value || null;
              change((card) => ({ ...card, due }));
            }}
          />
          {#if card.due}
            <Badge tone={column.done ? "neutral" : DUE_TONE[due_state(card.due, today)]}>{describe_due(card.due, today)}</Badge>
            <Button variant="quiet" size="sm" onclick={() => change((card) => ({ ...card, due: null }))}>Clear</Button>
          {/if}
        </div>
      </section>

      <section class="grid gap-2" aria-label="Checklist">
        <div class="flex items-center gap-2">
          <h3 class="text-2xs tracking-wide text-foreground/65 uppercase">Checklist</h3>
          {#if progress.total > 0}
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">{progress.done}/{progress.total}</span>
            <span class="h-1 flex-1 overflow-hidden rounded-full bg-field shadow-track">
              <span class="block h-full rounded-full bg-success transition-[width]" style:width="{(progress.done / progress.total) * 100}%"></span>
            </span>
          {/if}
        </div>
        {#if card.checklist.length > 0}
          <ul class="grid gap-0.5">
            {#each card.checklist as item (item.id)}
              <li class="group flex min-h-8 items-center gap-2 rounded-md px-1.5">
                <Checkbox checked={item.done} aria-label="Done: {item.text}" onchange={() => change((card) => update_check(card, item.id, { done: !item.done }))} />
                <input
                  value={check_text.value(`${card_id} ${item.id}`, item.text)}
                  aria-label="Checklist item"
                  oninput={(event) => check_text.edit(`${card_id} ${item.id}`, event.currentTarget.value)}
                  class={cn(
                    "h-7 min-w-0 flex-1 rounded-sm bg-transparent px-1 text-ui focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none",
                    item.done && "text-foreground/50 line-through"
                  )}
                />
                <IconButton
                  label="Remove item"
                  size="sm"
                  class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                  onclick={() => change((card) => remove_check(card, item.id))}
                >
                  <X />
                </IconButton>
              </li>
            {/each}
          </ul>
        {/if}
        <form class="flex gap-1.5" onsubmit={add_item}>
          <Input bind:value={new_check} size="sm" class="min-w-0 flex-1" placeholder="Add an item" aria-label="Add a checklist item" />
          <Button variant="secondary" size="sm" type="submit" disabled={!new_check.trim()}><Plus weight="bold" />Add</Button>
        </form>
      </section>

      <section class="grid gap-2" aria-label="Notes">
        <div class="flex items-center gap-2">
          <h3 class="flex-1 text-2xs tracking-wide text-foreground/65 uppercase">Notes</h3>
          <Segmented
            bind:value={mode}
            size="sm"
            label="Notes view"
            options={[
              { value: NotesMode.WRITE, label: "Write" },
              { value: NotesMode.PREVIEW, label: "Preview" },
            ]}
          />
        </div>
        {#if mode === NotesMode.WRITE}
          <Textarea
            value={notes.value(card_id, card.notes)}
            oninput={(event) => notes.edit(card_id, event.currentTarget.value)}
            placeholder={"Details, links, a plan.\n# heading, - list, **bold**, *italic*, `code`"}
            aria-label="Notes"
            class="field-sizing-content min-h-32"
          />
        {:else if notes.value(card_id, card.notes).trim()}
          <div class="rounded-md bg-foreground/4 px-3 py-2.5"><MarkdownView source={notes.value(card_id, card.notes)} /></div>
        {:else}
          <p class="text-ui text-foreground/55">No notes yet.</p>
        {/if}
      </section>

      <p class="font-mono text-2xs text-foreground/55">Created {format_datetime(new Date(card.created))} · in {column.name}</p>
    </div>
  </div>
{/if}

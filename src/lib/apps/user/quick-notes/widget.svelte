<script lang="ts">
  import kernel, { type FilesService, type WidgetProps } from "$lib/core/api";
  import { Checkbox, Input } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { untrack } from "svelte";
  import { NoteDraft } from "./draft.svelte";
  import { add_todo, NOTES_DIR, parse_todos, set_todo, title_of, type Note } from "./notes";
  import { NotesReader, read_todo, save_note, write_todo } from "./store";

  /** A sticky for one note (`props.note`), or the todo list without one (ADR-034). */
  let { props, size }: WidgetProps = $props();

  const files = $derived(kernel.service<FilesService>("files"));
  const note_id = $derived(typeof props.note === "string" ? props.note : null);

  let note = $state.raw<Note | null>(null);
  let todo_text = $state("");
  let loaded = $state(false);
  let adding = $state("");

  const reader = new NotesReader(() => files);
  let reload_id = 0;

  async function reload() {
    const id = ++reload_id;
    if (note_id) {
      const next = await reader.find(note_id);
      if (id === reload_id) note = next;
    } else {
      const next = await read_todo(files);
      if (id === reload_id) todo_text = next;
    }
    if (id === reload_id) loaded = true;
  }

  $effect(() => {
    files.revision(NOTES_DIR);
    void note_id;
    untrack(reload);
  });

  const draft = new NoteDraft(
    () => note,
    async (next) => {
      await save_note(files, next);
      return true;
    }
  );
  $effect(() => () => draft.cancel());

  const todos = $derived(parse_todos(todo_text));

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const text = adding.trim();
    if (!text) return;
    adding = "";
    await write_todo(files, add_todo(todo_text, text));
  }
</script>

{#if note_id}
  {#if note}
    <textarea
      class={cn(
        "size-full resize-none bg-primary/8 leading-relaxed text-foreground outline-none placeholder:text-foreground/40",
        size.w >= 4 && size.h >= 3 ? "px-4 py-3 text-base" : "px-3 py-2 text-ui"
      )}
      value={draft.body}
      placeholder="Write it down"
      aria-label={title_of(note.body)}
      oninput={(event) => draft.edit(event.currentTarget.value)}
    ></textarea>
  {:else if loaded}
    <p class="p-3 text-ui text-foreground/65">This note is gone. Remove the widget, or pin another.</p>
  {/if}
{:else}
  <div class="flex h-full flex-col">
    <ul class="min-h-0 flex-1 overflow-auto p-1.5">
      {#each todos as todo (todo.line)}
        <li class="flex min-h-7 items-center gap-2 rounded-md px-1.5 hover:bg-foreground/6">
          <Checkbox
            checked={todo.done}
            aria-label={todo.text}
            onchange={async () => {
              const next = set_todo(todo_text, todo.n, !todo.done);
              if (next !== null) await write_todo(files, next);
            }}
          />
          <span class={cn("min-w-0 flex-1 truncate text-ui", todo.done && "text-foreground/45 line-through")}>{todo.text}</span>
        </li>
      {:else}
        {#if loaded}<li class="px-1.5 py-1 text-ui text-foreground/55">Nothing to do.</li>{/if}
      {/each}
    </ul>
    <form class="border-t border-hairline p-1.5" onsubmit={add}>
      <Input bind:value={adding} size="sm" class="w-full" placeholder="Add a todo" aria-label="Add a todo" />
    </form>
  </div>
{/if}

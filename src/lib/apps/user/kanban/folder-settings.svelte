<script lang="ts">
  import { Button, IconButton, Input } from "$lib/core/components/ui";
  import { parent_path } from "$lib/core/api/services/files/path";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { FileText, FolderOpen, X } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { FOLDER_FIELD, type Board, type Folder } from "./data";
  import { NO_VALUE, order_columns, split_list } from "./folder";

  interface Props {
    /** The board as shown, so the order lists columns met only in the files too. */
    board: Board;
    folder: Folder;
    edit: (update: (board: Board) => Board) => void;
    onclose: () => void;
  }

  let { board, folder, edit, onclose }: Props = $props();

  const { window: win } = get_app_context();

  const initial_order = untrack(() =>
    board.columns
      .filter((column) => column.id !== NO_VALUE)
      .map((column) => column.id)
      .join(", ")
  );
  let path = $state(untrack(() => folder.path));
  let field = $state(untrack(() => folder.field));
  let template = $state<string | null>(untrack(() => folder.template));
  let show = $state(untrack(() => folder.show.join(", ")));
  let order = $state(initial_order);

  async function pick_folder() {
    const picked = await win.pick_directory({ title: "Board folder", start_path: path });
    if (picked) path = picked;
  }

  async function pick_template() {
    const picked = await win.pick_file({ title: "Template for new cards", accept: [".md"], start_path: template ? parent_path(template) : path });
    if (picked) template = picked;
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    const next_field = field.trim() || FOLDER_FIELD;
    // A new field has other values, so the old order only goes along when it was retyped.
    const values = next_field !== folder.field && order === initial_order ? [] : split_list(order);
    edit((stored) => order_columns({ ...stored, folder: { path, field: next_field, template, show: split_list(show) } }, values));
    onclose();
  }
</script>

<form class="flex h-full min-h-0 flex-col" onsubmit={save}>
  <header class="flex h-11 shrink-0 items-center gap-2 border-b border-foreground/8 px-2">
    <IconButton label="Close" size="sm" onclick={onclose}><X weight="bold" /></IconButton>
    <h2 class="flex-1 truncate text-ui font-semibold">Folder board</h2>
    <Button variant="primary" size="sm" type="submit">Save</Button>
  </header>
  <div class="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 py-4">
    <section class="grid gap-2">
      <h3 class="text-2xs tracking-wide text-foreground/65 uppercase">Folder</h3>
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 truncate font-mono text-ui" title={path}>{path}</span>
        <Button variant="secondary" size="sm" onclick={pick_folder}><FolderOpen />Change…</Button>
      </div>
      <p class="text-2xs text-foreground/60">Every markdown file directly inside is a card.</p>
    </section>

    <label class="grid gap-2">
      <span class="text-2xs tracking-wide text-foreground/65 uppercase">Column field</span>
      <Input size="sm" bind:value={field} placeholder={FOLDER_FIELD} autocomplete="off" spellcheck={false} />
      <span class="text-2xs text-foreground/60">The frontmatter field whose value picks the column. Moving a card rewrites only this field.</span>
    </label>

    <label class="grid gap-2">
      <span class="text-2xs tracking-wide text-foreground/65 uppercase">Column order</span>
      <Input size="sm" bind:value={order} placeholder="raw, ready, in-progress, done" autocomplete="off" spellcheck={false} />
      <span class="text-2xs text-foreground/60">Values separated by commas. Values not listed follow in the order the files use them.</span>
    </label>

    <label class="grid gap-2">
      <span class="text-2xs tracking-wide text-foreground/65 uppercase">Fields on cards</span>
      <Input size="sm" bind:value={show} placeholder="project, tags, created" autocomplete="off" spellcheck={false} />
    </label>

    <section class="grid gap-2">
      <h3 class="text-2xs tracking-wide text-foreground/65 uppercase">Template for new cards</h3>
      <div class="flex items-center gap-2">
        <span class={cn("min-w-0 flex-1 truncate font-mono text-ui", !template && "text-foreground/55")} title={template ?? undefined}>{template ?? "None: a heading only"}</span>
        {#if template}<IconButton label="No template" size="sm" onclick={() => (template = null)}><X /></IconButton>{/if}
        <Button variant="secondary" size="sm" onclick={pick_template}><FileText />Pick…</Button>
      </div>
      <p class="text-2xs text-foreground/60">Fills <code class="font-mono">{"{{title}}"}</code> and <code class="font-mono">{"{{date}}"}</code>, then sets the column field.</p>
    </section>
  </div>
</form>

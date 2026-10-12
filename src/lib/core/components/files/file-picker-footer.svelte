<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import { join_path } from "$lib/core/api/services/files/path";
  import { Button, Input } from "../ui";
  import type { PickerMode } from "./picker";

  let { handler, picker, selected }: { handler: DirectoryHandler; picker: PickerMode; selected: string | null } = $props();

  // A directory picker can take the open folder itself when nothing inside it is selected.
  const choice = $derived(
    selected ? join_path(handler.segments, selected) : picker.kind === "directory" ? handler.path : null
  );

  // Clicking a file takes its name; typing overrides it until the next click.
  let name = $derived(selected ?? picker.name ?? "");
  const trimmed = $derived(name.trim());
  const existing = $derived(handler.items.find((item) => item.name === trimmed));
  const invalid = $derived(!trimmed || trimmed === "." || trimmed === ".." || trimmed.includes("/"));
  const save_path = $derived(invalid || existing?.kind === "directory" ? null : join_path(handler.segments, trimmed));
</script>

{#if picker.kind === "save"}
  <form
    class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-foreground/8 bg-background-light px-3 py-2.5"
    onsubmit={(event) => {
      event.preventDefault();
      if (save_path) picker.onchoose(save_path);
    }}
  >
    <Input bind:value={name} aria-label="File name" placeholder="File name" class="min-w-48 flex-1" autofocus />
    {#if existing?.kind === "directory"}
      <span class="shrink-0 text-2xs text-error">A folder has this name</span>
    {:else if existing}
      <span class="shrink-0 text-2xs text-foreground/80">Replaces the existing file</span>
    {/if}
    <Button type="button" variant="quiet" onclick={picker.oncancel}>Cancel</Button>
    <Button type="submit" variant={existing ? "danger" : "primary"} disabled={!save_path}>{existing ? "Replace" : "Save"}</Button>
  </form>
{:else}
  <div class="flex shrink-0 items-center gap-3 border-t border-foreground/8 bg-background-light px-3 py-2.5">
    <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80" title={choice ?? undefined}>
      {choice ?? (picker.kind === "file" ? "Choose a file" : "Choose a folder")}
    </span>
    <Button variant="quiet" onclick={picker.oncancel}>Cancel</Button>
    <Button variant="primary" disabled={!choice} onclick={() => choice && picker.onchoose(choice)}>
      {picker.kind === "file" ? "Open" : "Select folder"}
    </Button>
  </div>
{/if}

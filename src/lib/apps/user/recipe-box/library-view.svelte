<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { tilde_path } from "$lib/core/api/services/files/path";
  import { Badge, Button, EmptyState, Input, Spinner } from "$lib/core/components/ui";
  import { cn, error_message } from "$lib/core/utils";
  import { BookOpen as BookOpenIcon, MagnifyingGlass as MagnifyingGlassIcon, Plus as PlusIcon, WarningCircle as WarningCircleIcon } from "phosphor-svelte";
  import { all_tags, ensure_folder, list_recipes, recipe_matches, type RecipeEntry } from "./library";

  interface Props {
    folder: string;
    onopen: (path: string) => void;
    onnew: () => void;
  }

  const { folder, onopen, onnew }: Props = $props();

  const files = $derived(kernel.service<FilesService>("files"));

  let entries = $state.raw<RecipeEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let query = $state("");
  let tag = $state<string | null>(null);

  const tags = $derived(all_tags(entries));
  const shown = $derived(entries.filter((entry) => recipe_matches(entry, query, tag)));

  $effect(() => {
    const target = folder;
    files.revision(target);
    let live = true;
    void (async () => {
      try {
        await ensure_folder(target);
        const found = await list_recipes(target);
        if (!live) return;
        entries = found;
        error = null;
      } catch (reason) {
        if (live) error = error_message(reason);
      } finally {
        if (live) loading = false;
      }
    })();
    return () => {
      live = false;
    };
  });
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex flex-col gap-2 border-b border-hairline p-3">
    <Input size="sm" type="search" placeholder="Search titles, tags, ingredients" aria-label="Search recipes" bind:value={query}>
      {#snippet leading()}<MagnifyingGlassIcon class="size-3.5" />{/snippet}
    </Input>
    {#if tags.length > 0}
      <div class="flex gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Filter by tag">
        {#each tags as name (name)}
          <Button size="sm" variant="quiet" class="shrink-0" pressed={tag === name} onclick={() => (tag = tag === name ? null : name)}>{name}</Button>
        {/each}
      </div>
    {/if}
  </div>

  {#if loading}
    <div class="grid flex-1 place-items-center"><Spinner label="Reading recipes" /></div>
  {:else if error}
    <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't read the recipes folder" description={error} />
  {:else if entries.length === 0}
    <EmptyState icon={BookOpenIcon} title="No recipes yet" description={`Recipes are .cook files in ${tilde_path(folder)}.`}>
      {#snippet actions()}<Button size="sm" variant="primary" onclick={onnew}><PlusIcon />New recipe</Button>{/snippet}
    </EmptyState>
  {:else if shown.length === 0}
    <EmptyState icon={MagnifyingGlassIcon} title="No matches" description="Try another word, or clear the tag." />
  {:else}
    <ul class="grid min-h-0 flex-1 auto-rows-min gap-2 overflow-y-auto p-3 @2xl:grid-cols-2 @5xl:grid-cols-3" aria-label="Recipes">
      {#each shown as entry (entry.path)}
        <li>
          <button
            type="button"
            class={cn(
              "flex w-full flex-col gap-1.5 rounded-lg bg-background-light p-3 text-left shadow-card ring-1 ring-hairline transition-colors duration-150",
              "hover:bg-foreground/6 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none"
            )}
            onclick={() => onopen(entry.path)}
          >
            <span class="text-sm font-medium">{entry.title}</span>
            <span class="line-clamp-2 text-2xs text-foreground/65">
              {entry.ingredients.length} {entry.ingredients.length === 1 ? "ingredient" : "ingredients"}{entry.servings ? ` · serves ${entry.servings}` : ""}{entry.ingredients.length > 0 ? ` · ${entry.ingredients.slice(0, 6).join(", ")}` : ""}
            </span>
            {#if entry.tags.length > 0}
              <span class="flex flex-wrap gap-1">{#each entry.tags as name (name)}<Badge>{name}</Badge>{/each}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { parent_path, tilde_path } from "$lib/core/api/services/files/path";
  import { Badge, Button, EmptyState, IconButton, Input, Spinner } from "$lib/core/components/ui";
  import { cn, error_message } from "$lib/core/utils";
  import { long_press } from "$lib/core/utils/long-press";
  import type { Position } from "$lib/core/utils/type";
  import {
    BookOpen as BookOpenIcon,
    ClipboardText as ClipboardTextIcon,
    Heart as HeartIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    Plus as PlusIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { all_tags, ensure_folder, favorites_first, list_recipes, recipe_matches, type RecipeEntry } from "./library";

  interface Props {
    folder: string;
    onopen: (path: string) => void;
    onnew: () => void;
    onpaste: () => void;
    onfavorite: (path: string, on: boolean) => void;
    onmenu: (path: string, anchor: Position) => void;
  }

  const { folder, onopen, onnew, onpaste, onfavorite, onmenu }: Props = $props();

  const files = $derived(kernel.service<FilesService>("files"));

  let entries = $state.raw<RecipeEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let query = $state("");
  let tag = $state<string | null>(null);
  let favorites_only = $state(false);

  const tags = $derived(all_tags(entries));
  const any_favorite = $derived(entries.some((entry) => entry.favorite));
  const shown = $derived(favorites_first(entries.filter((entry) => recipe_matches(entry, query, tag) && (!favorites_only || entry.favorite))));

  const subfolders = $derived(
    [...new Set(entries.map((entry) => parent_path(entry.path)))]
      .filter((path) => path !== folder)
      .sort()
      .join("\n")
  );

  $effect(() => {
    const target = folder;
    files.revision(target);
    for (const path of subfolders.split("\n")) if (path) files.revision(path);
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

{#snippet card(entry: RecipeEntry)}
  <div class="relative h-full" {@attach long_press({ on_menu: (point) => onmenu(entry.path, point), ignore: "[data-heart]" })}>
    <button
      type="button"
      class={cn(
        "flex h-full w-full flex-col gap-1 rounded-lg bg-background-light py-2.5 pr-11 pl-3 text-left ring-1 ring-foreground/8 transition-colors duration-150",
        "hover:bg-foreground/6 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none"
      )}
      onclick={() => onopen(entry.path)}
    >
      <span class="line-clamp-2 text-sm font-medium">{entry.title}</span>
      <span class="truncate text-2xs text-foreground/65">
        {entry.ingredients.length} {entry.ingredients.length === 1 ? "ingredient" : "ingredients"}{entry.servings ? ` · serves ${entry.servings}` : ""}
      </span>
      {#if entry.tags.length > 0}
        <span class="mt-0.5 flex flex-wrap gap-1">{#each entry.tags as name (name)}<Badge>{name}</Badge>{/each}</span>
      {/if}
    </button>
    <IconButton
      size="sm"
      class="absolute top-1.5 right-1.5"
      data-heart
      label={entry.favorite ? `Remove ${entry.title} from favourites` : `Add ${entry.title} to favourites`}
      pressed={entry.favorite}
      onclick={() => onfavorite(entry.path, !entry.favorite)}
    >
      <HeartIcon weight={entry.favorite ? "fill" : "regular"} class={entry.favorite ? "text-primary" : undefined} />
    </IconButton>
  </div>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex flex-col gap-2 border-b border-foreground/8 p-3">
    <Input size="sm" type="search" placeholder="Search titles, tags, ingredients" aria-label="Search recipes" bind:value={query}>
      {#snippet leading()}<MagnifyingGlassIcon class="size-3.5" />{/snippet}
    </Input>
    {#if tags.length > 0 || any_favorite}
      <div class="flex gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Filter">
        {#if any_favorite}
          <Button size="sm" variant="quiet" class="shrink-0" pressed={favorites_only} onclick={() => (favorites_only = !favorites_only)}>
            <HeartIcon weight={favorites_only ? "fill" : "regular"} />Favourites
          </Button>
        {/if}
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
    <EmptyState icon={BookOpenIcon} title="No recipes yet" description={`Paste one from a website, or write your own. They're saved in ${tilde_path(folder)}.`}>
      {#snippet actions()}
        <Button size="sm" variant="primary" onclick={onpaste}><ClipboardTextIcon />Paste a recipe</Button>
        <Button size="sm" onclick={onnew}><PlusIcon />New recipe</Button>
      {/snippet}
    </EmptyState>
  {:else if shown.length === 0}
    <EmptyState icon={MagnifyingGlassIcon} title="No matches" description="Try another word, or clear the filter." />
  {:else}
    <ul class="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-2 overflow-y-auto p-3" aria-label="Recipes">
      {#each shown as entry (entry.path)}
        <li>{@render card(entry)}</li>
      {/each}
    </ul>
  {/if}
</div>

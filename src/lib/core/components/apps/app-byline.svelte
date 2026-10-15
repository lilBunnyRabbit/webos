<script lang="ts">
  import { app_authors, author_link, type AppManifest } from "$lib/core/api";
  import { cn } from "$lib/core/utils";

  let { manifest, class: class_name }: { manifest: Pick<AppManifest, "authors">; class?: string } = $props();

  const authors = $derived(app_authors(manifest));
</script>

<p class={cn("text-ui text-foreground/65", class_name)}>
  By
  {#each authors as author, index (author.name)}
    {@const href = author_link(author)}
    {#if href}
      <a {href} target="_blank" rel="noopener noreferrer" class="font-medium text-foreground/80 underline-offset-2 hover:text-primary hover:underline">{author.name}</a>
    {:else}
      <span class="font-medium text-foreground/80">{author.name}</span>
    {/if}{index < authors.length - 2 ? ", " : index === authors.length - 2 ? " and " : ""}
  {/each}
</p>

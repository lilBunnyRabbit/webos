<script lang="ts">
  import type { DialogProps } from "$lib/core/api";
  import { tilde_path } from "$lib/core/api/services/files/path";
  import { Button, Spinner } from "$lib/core/components/ui";
  import { Article as ArticleIcon, Envelope as EnvelopeIcon, File as FileIcon, FilePlus as FilePlusIcon, IdentificationBadge as IdentificationBadgeIcon, IdentificationCard as IdentificationCardIcon, Notebook as NotebookIcon, UserList as UserListIcon } from "phosphor-svelte";
  import type { Component } from "svelte";
  import { BUILTIN_TEMPLATES, TEMPLATES_DIR, user_templates, type Template } from "./templates";

  let { resolve }: DialogProps<Template | "blank"> = $props();

  const ICONS: Record<string, Component> = {
    "builtin:cv": IdentificationCardIcon,
    "builtin:cv-two-column": IdentificationBadgeIcon,
    "builtin:cover-letter": UserListIcon,
    "builtin:letter": EnvelopeIcon,
    "builtin:report": NotebookIcon,
  };

  let yours = $state<Template[] | null>(null);
  let failed = $state(false);

  $effect(() => {
    let stale = false;
    user_templates()
      .then((list) => !stale && (yours = list))
      .catch(() => !stale && ((yours = []), (failed = true)));
    return () => (stale = true);
  });
</script>

{#snippet card(name: string, description: string, Icon: Component, pick: () => void)}
  <button
    type="button"
    class="flex min-h-14 min-w-0 items-center gap-3 rounded-lg bg-background-lightest px-3 py-2 text-left shadow-raised ring-1 ring-hairline transition-[box-shadow,translate] duration-150 hover:ring-hairline-strong focus-visible:outline-2 focus-visible:outline-cottontail active:translate-y-px active:shadow-pressed"
    onclick={pick}
  >
    <Icon weight="duotone" class="size-6 shrink-0 text-primary" />
    <span class="min-w-0">
      <span class="block truncate text-ui font-medium">{name}</span>
      <span class="line-clamp-2 text-2xs text-foreground/65">{description}</span>
    </span>
  </button>
{/snippet}

<div class="@container grid max-h-[min(36rem,calc(100cqh-2rem))] w-[min(36rem,calc(100cqw-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 rounded-2xl bg-background-lighter p-5 shadow-popover" role="dialog" aria-label="New from template">
  <div>
    <h2 class="text-sm font-semibold">New from template</h2>
    <p class="mt-0.5 text-ui text-foreground/65">Starts a new document with the template's text, font, page and header. Replace the placeholders with your own.</p>
  </div>

  <div class="flex min-h-0 flex-col gap-3 overflow-y-auto">
    <div class="grid grid-cols-1 gap-2 @sm:grid-cols-2">
      {@render card("Blank document", "An empty A4 page", FilePlusIcon, () => resolve("blank"))}
      {#each BUILTIN_TEMPLATES as template (template.id)}
        {@render card(template.name, template.description, ICONS[template.id] ?? ArticleIcon, () => resolve(template))}
      {/each}
    </div>

    <section class="flex flex-col gap-2" aria-label="Your templates">
      <h3 class="text-2xs font-semibold tracking-wide text-foreground/65 uppercase">Yours</h3>
      {#if yours === null}
        <Spinner label="Looking for your templates" />
      {:else if yours.length}
        <div class="grid grid-cols-1 gap-2 @sm:grid-cols-2">
          {#each yours as template (template.id)}
            {@render card(template.name, tilde_path(template.description), FileIcon, () => resolve(template))}
          {/each}
        </div>
      {:else}
        <p class="text-ui text-foreground/65">
          {failed ? "Couldn't read" : "Nothing in"} <span class="font-mono text-2xs">{tilde_path(TEMPLATES_DIR)}</span> yet. File › Save as template… puts the open document there.
        </p>
      {/if}
    </section>
  </div>

  <div class="flex justify-end">
    <Button variant="quiet" onclick={() => resolve(null)}>Cancel</Button>
  </div>
</div>

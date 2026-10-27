<script lang="ts">
  import kernel, { type AppsService } from "$lib/core/api";
  import type { AppManifest } from "$lib/core/api/services/apps/type";
  import { Button, Segmented } from "$lib/core/components/ui";
  import { ArrowSquareOut as ArrowSquareOutIcon, BookOpenText as BookOpenTextIcon } from "phosphor-svelte";
  import { slugify } from "../outline";
  import { has_page } from "../pages";

  interface Props {
    onopen: (id: string, hash?: string) => void;
  }

  let { onopen }: Props = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));

  const SECTIONS = [
    { key: "system", label: "System" },
    { key: "productivity", label: "Productivity" },
    { key: "media", label: "Media" },
    { key: "utilities", label: "Utilities" },
    { key: "developer", label: "Developer" },
    { key: "games", label: "Games" },
  ];

  const Show = { DOCUMENTED: "documented", ALL: "all" } as const;
  type Show = (typeof Show)[keyof typeof Show];
  let show = $state<Show>(Show.DOCUMENTED);

  const all = $derived([...apps.list({ all: true })].map(([, manifest]) => manifest).slice().sort((a, b) => a.name.localeCompare(b.name)));
  const internals = (app: AppManifest) => !app.system && has_page(`apps/${app.id}`);
  const documented = $derived(all.filter((app) => app.system || internals(app)));
  const listed = $derived(show === Show.ALL ? all : documented);
  const sections = $derived(
    SECTIONS.map((section) => ({
      ...section,
      apps: listed.filter((app) => (section.key === "system" ? app.system : !app.system && app.category === section.key)),
    })).filter((section) => section.apps.length > 0)
  );

  function read(app: AppManifest) {
    if (app.system) onopen("system/system-apps", slugify(app.name));
    else onopen(`apps/${app.id}`);
  }
</script>

<section class="flex flex-col gap-4" aria-label="App atlas">
  <p class="text-ui text-foreground/80">
    <span class="font-mono tabular-nums">{all.length}</span> apps in this build. The <span class="font-mono tabular-nums">{documented.filter((app) => app.system).length}</span>
    system apps are described in one page; <span class="font-mono tabular-nums">{documented.filter((app) => !app.system).length}</span> user apps have a page on how they work inside.
  </p>
  <Segmented
    bind:value={show}
    options={[
      { value: Show.DOCUMENTED, label: "With a page" },
      { value: Show.ALL, label: "All apps" },
    ]}
    label="Show"
    size="sm"
  />
  {#each sections as section (section.key)}
    <div class="flex flex-col gap-2">
      <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{section.label} <span class="font-mono tabular-nums">{section.apps.length}</span></h3>
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2">
        {#each section.apps as app (app.id)}
          {@const Icon = app.icon}
          <li class="flex items-center gap-3 rounded-xl bg-background-light p-2.5 ring-1 ring-foreground/8">
            <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-xl shadow-raised ring-1 ring-foreground/8"><Icon /></span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-ui font-medium">{app.name}</span>
              <span class="truncate font-mono text-2xs text-foreground/65">{app.id}</span>
            </span>
            {#if app.system || internals(app)}
              <Button size="sm" variant="quiet" onclick={() => read(app)} aria-label="Read about {app.name}"><BookOpenTextIcon weight="bold" />Read</Button>
            {/if}
            <Button size="sm" variant="secondary" onclick={() => apps.launch(app.id)} aria-label="Open {app.name}"><ArrowSquareOutIcon weight="bold" />Open</Button>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</section>

<script lang="ts">
  import kernel, {
    app_history,
    ChangeKind,
    NotificationType,
    Platform,
    type AppManifest,
    type AppsService,
    type DesktopService,
    type NotificationsService,
    type VersionService,
  } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import AppBadge from "$lib/core/components/apps/app-badge.svelte";
  import AppByline from "$lib/core/components/apps/app-byline.svelte";
  import { Badge, Button, IconButton } from "$lib/core/components/ui";
  import { ArrowLeft as ArrowLeftIcon, Play as PlayIcon, PushPin as PushPinIcon, Sparkle as SparkleIcon, Sticker as StickerIcon } from "phosphor-svelte";
  import { format_date } from "$lib/core/utils";
  import { WIDGET_FALLBACK_SIZE } from "$lib/core/api/services/apps/widget";
  import { app_commands, app_file_types, category_label } from "./library";

  interface Props {
    manifest: AppManifest;
    /** From this session's unseen releases. */
    freshness: "new" | "updated" | null;
    onback: () => void;
  }

  let { manifest, freshness, onback }: Props = $props();

  const HISTORY_PREVIEW = 4;
  const KINDS = {
    [ChangeKind.NEW]: { label: "New", tone: "primary" },
    [ChangeKind.IMPROVED]: { label: "Improved", tone: "info" },
    [ChangeKind.FIXED]: { label: "Fixed", tone: "success" },
  } as const;

  const { app_id } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const version = $derived(kernel.service<VersionService>("version"));

  const history = $derived(app_history(version.changelog, manifest.id));
  let show_all = $state(false);
  const changes = $derived(show_all ? history.changes : history.changes.slice(0, HISTORY_PREVIEW));
  const day = (date: string) => format_date(new Date(`${date}T00:00`));

  const mobile = kernel.platform === Platform.MOBILE;
  const types = $derived(app_file_types(manifest));
  const commands = $derived(app_commands(manifest));
  const size = $derived(manifest.widget_size);

  async function pin() {
    try {
      const name = await desktop.pin(manifest.id);
      if (!name) throw new Error(`${manifest.name} isn't installed`);
      notifications.notify(app_id, { title: mobile ? "Added to the home screen" : "Pinned to the desktop", message: manifest.name });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: `Couldn't pin ${manifest.name}`, message: String(reason) });
    }
  }

  async function add_widget() {
    try {
      const name = await desktop.pin_widget(manifest.id, { label: manifest.name });
      if (!name) throw new Error("The desktop is full");
      notifications.notify(app_id, { title: "Widget added to the desktop", message: manifest.name });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: `Couldn't add the ${manifest.name} widget`, message: String(reason) });
    }
  }
</script>

{#snippet heading(text: string)}
  <h3 class="pb-1.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{text}</h3>
{/snippet}

{#snippet chips(list: string[], mono = false)}
  <ul class="flex flex-wrap gap-1">
    {#each list as item (item)}
      <li><Badge class={mono ? "font-mono" : undefined}>{item}</Badge></li>
    {/each}
  </ul>
{/snippet}

<div class="flex flex-col gap-5 p-4 @4xl:p-5">
  <div class="flex items-start gap-3">
    <IconButton label="Back to all apps" class="-ml-1 @4xl:hidden" onclick={onback}>
      <ArrowLeftIcon weight="bold" />
    </IconButton>
    <span class="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-background-light shadow-raised ring-1 ring-foreground/10">
      <manifest.icon class="size-8" weight="duotone" />
      <AppBadge app_id={manifest.id} />
    </span>
    <div class="min-w-0 flex-1">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <span class="truncate">{manifest.name}</span>
        {#if freshness === "new"}<Badge tone="primary">New</Badge>{:else if freshness === "updated"}<Badge tone="info">Updated</Badge>{/if}
      </h2>
      <p class="flex flex-wrap items-center gap-x-2 text-ui text-foreground/80">
        {category_label(manifest)}
        {#if history.added || history.updated}
          <span class="font-mono text-2xs text-foreground/65">
            {#if history.added}Added v{history.added.version}{/if}{#if history.added && history.updated}{" · "}{/if}{#if history.updated}Updated v{history.updated.version}{/if}
          </span>
        {:else}
          <span class="font-mono text-2xs text-foreground/65">v{manifest.version}</span>
        {/if}
      </p>
      <AppByline {manifest} class="mt-0.5" />
    </div>
  </div>

  <div class="flex flex-wrap gap-1.5">
    <Button variant="primary" onclick={() => apps.launch(manifest.id)}><PlayIcon weight="fill" /> Launch</Button>
    <Button onclick={pin}><PushPinIcon weight="bold" /> {mobile ? "Add to home screen" : "Pin to desktop"}</Button>
    {#if manifest.widget && !mobile}
      <Button onclick={add_widget}><StickerIcon weight="bold" /> Add widget</Button>
    {/if}
  </div>

  {#if manifest.description}
    <p class="text-sm text-pretty">{manifest.description}</p>
  {/if}

  {#if manifest.highlights?.length}
    <section>
      {@render heading("What it does")}
      <ul class="flex flex-col gap-1.5">
        {#each manifest.highlights as highlight (highlight.title)}
          <li class="flex gap-2.5 rounded-lg bg-background-light p-2.5 ring-1 ring-foreground/8">
            <span class="grid size-7 shrink-0 place-items-center rounded-md bg-primary/12 text-primary">
              <highlight.icon class="size-4" weight="duotone" />
            </span>
            <div class="min-w-0">
              <h4 class="text-ui font-semibold">{highlight.title}</h4>
              <p class="text-2xs text-pretty text-foreground/65">{highlight.text}</p>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if manifest.keywords?.length}
    <section>{@render heading("Keywords")}{@render chips(manifest.keywords)}</section>
  {/if}

  {#if types.opens.length}
    <section>{@render heading("Opens")}{@render chips(types.opens, true)}</section>
  {/if}

  {#if types.works_on.length}
    <section>
      {@render heading("Works on, from Open with")}
      {@render chips(types.works_on, true)}
    </section>
  {/if}

  {#if commands.length}
    <section>
      {@render heading("Commands")}
      <ul class="flex flex-col gap-1">
        {#each commands as command (command.id)}
          <li class="flex min-w-0 items-baseline gap-2">
            <span class="shrink-0 font-mono text-2xs">{command.id}</span>
            <span class="truncate text-2xs text-foreground/65" title={command.description}>{command.description}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if manifest.widget}
    <section>
      {@render heading("Widget")}
      <p class="text-ui text-foreground/80">
        {#if size}
          <span class="font-mono">{size.default.w}×{size.default.h}</span>, resizable from
          <span class="font-mono">{size.min.w}×{size.min.h}</span> to <span class="font-mono">{size.max.w}×{size.max.h}</span> cells
        {:else}
          <span class="font-mono">{WIDGET_FALLBACK_SIZE.w}×{WIDGET_FALLBACK_SIZE.h}</span> cells, fixed size
        {/if}
        {#if mobile}· desktop only{/if}
      </p>
    </section>
  {/if}

  {#if history.changes.length || history.added}
    <section>
      {@render heading("History")}
      <ol class="flex flex-col">
        {#each changes as { release, change }, index (index)}
          <li class="flex flex-col gap-1 border-b border-foreground/8 py-2 first:pt-0">
            <div class="flex items-center gap-2">
              <Badge tone={KINDS[change.kind].tone}>{KINDS[change.kind].label}</Badge>
              <span class="font-mono text-2xs text-foreground/65">v{release.version}</span>
              <time class="ml-auto font-mono text-2xs text-foreground/65" datetime={release.date}>{day(release.date)}</time>
            </div>
            <p class="text-ui text-pretty">{change.text}</p>
          </li>
        {/each}
        {#if history.added && (show_all || history.changes.length <= HISTORY_PREVIEW)}
          <li class="flex items-center gap-2 pt-2 text-ui text-foreground/80">
            <SparkleIcon class="size-3.5 shrink-0 text-primary" weight="fill" />
            Added in <span class="font-mono text-2xs">v{history.added.version}</span>
            <time class="ml-auto font-mono text-2xs text-foreground/65" datetime={history.added.date}>{day(history.added.date)}</time>
          </li>
        {/if}
      </ol>
      {#if history.changes.length > HISTORY_PREVIEW}
        <Button size="sm" variant="quiet" class="mt-1 -ml-2" onclick={() => (show_all = !show_all)}>
          {show_all ? "Show less" : `Show all ${history.changes.length}`}
        </Button>
      {/if}
    </section>
  {/if}

  <section>
    {@render heading("Shell")}
    <p class="font-mono text-2xs text-foreground/80">app launch {manifest.id}</p>
  </section>
</div>

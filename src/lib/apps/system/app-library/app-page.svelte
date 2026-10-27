<script lang="ts">
  import kernel, {
    is_core_app,
    app_history,
    ChangeKind,
    format_usage,
    Mode,
    RouteKind,
    WIDGET_FALLBACK_SIZE,
    NotificationType,
    Platform,
    type AchievementsService,
    type AppListing,
    type AppsService,
    type ClipboardService,
    type DesktopService,
    type NotificationsService,
    type SettingsService,
    type ShellService,
    type VersionService,
    with_pin,
    without_pin,
  } from "$lib/core/api";
  import { route_url } from "$lib/core/api/services/router/route";
  import { get_app_context } from "$lib/core/contexts/app";
  import AppByline from "$lib/core/components/apps/app-byline.svelte";
  import AchievementList from "$lib/core/components/achievements/achievement-list.svelte";
  import { uninstall_app } from "$lib/core/components/apps/app-actions";
  import { Badge, Button, IconButton } from "$lib/core/components/ui";
  import { cn, format_bytes, format_date } from "$lib/core/utils";
  import {
    ArrowLeft as ArrowLeftIcon,
    ArrowRight as ArrowRightIcon,
    LinkSimple as LinkSimpleIcon,
    Package as PackageIcon,
    PushPin as PushPinIcon,
    PushPinSimple as PushPinSimpleIcon,
    PushPinSimpleSlash as PushPinSimpleSlashIcon,
    Sparkle as SparkleIcon,
    Sticker as StickerIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { is_game, release_of } from "./discover";
  import IconTile from "./icon-tile.svelte";
  import { app_commands, app_file_types, app_story, category_label } from "./library";
  import ShelfView from "./shelf.svelte";
  import StoreButton from "./store-button.svelte";

  interface Props {
    manifest: AppListing;
    size: number | null;
    related: AppListing[];
    /** From this session's unseen releases. */
    freshness: "new" | "updated" | null;
    onback: () => void;
    onselect: (manifest: AppListing) => void;
  }

  let { manifest, size, related, freshness, onback, onselect }: Props = $props();

  const HISTORY_PREVIEW = 4;
  const KINDS = {
    [ChangeKind.NEW]: { label: "New", tone: "primary" },
    [ChangeKind.IMPROVED]: { label: "Improved", tone: "info" },
    [ChangeKind.FIXED]: { label: "Fixed", tone: "success" },
  } as const;

  const { app_id } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));
  const achievements = $derived(kernel.service<AchievementsService>("achievements"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const version = $derived(kernel.service<VersionService>("version"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));
  const shell = $derived(kernel.service<ShellService>("shell"));
  untrack(() => void shell.load());

  const mobile = kernel.platform === Platform.MOBILE;
  const solo = kernel.mode === Mode.SOLO;
  const installed = $derived(apps.is_installed(manifest.id));
  const on_taskbar = $derived(settings.taskbar.pinned.includes(manifest.id));
  const story = $derived(app_story(manifest));
  const history = $derived(app_history(version.changelog, manifest.id));
  const released = $derived(release_of(version.changelog, manifest.version));
  const usage = $derived(apps.usage(manifest.id));
  const game = $derived(is_game(manifest));
  const achievements_list = $derived(achievements.list(manifest.id));
  const unlocked_count = $derived(achievements_list.filter((entry) => entry.unlocked).length);
  const types = $derived(app_file_types(manifest));
  const commands = $derived(app_commands(manifest, shell.commands));
  const widget_size = $derived(manifest.widget_size);
  let show_all = $state(false);
  const changes = $derived(show_all ? history.changes : history.changes.slice(0, HISTORY_PREVIEW));
  const day = (date: string) => format_date(new Date(`${date}T00:00`));

  const facts = $derived(
    [
      { label: "Version", value: manifest.version, mono: true },
      released && { label: "Updated", value: day(released.date) },
      size !== null && { label: "Size", value: format_bytes(size), mono: true },
      { label: game ? "Played" : "Used", value: usage ? format_usage(usage.seconds) : "Not yet" },
      { label: "Category", value: category_label(manifest) },
      types.opens.length > 0 && { label: "Opens", value: `${types.opens.length} file type${types.opens.length === 1 ? "" : "s"}` },
    ].filter((fact) => !!fact)
  );

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
      if (!name) throw new Error(mobile ? "The home screen is full" : "The desktop is full");
      notifications.notify(app_id, { title: mobile ? "Widget added to the home screen" : "Widget added to the desktop", message: manifest.name });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: `Couldn't add the ${manifest.name} widget`, message: String(reason) });
    }
  }

  async function copy_link() {
    const link = route_url({ kind: RouteKind.SOLO, id: manifest.id, props: undefined });
    try {
      await clipboard.copy_text(link);
      notifications.notify(app_id, { type: NotificationType.INFO, title: `Solo link to ${manifest.name} copied`, message: link });
    } catch {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't copy the link" });
    }
  }
</script>

{#snippet heading(text: string)}
  <h3 class="text-base leading-tight font-semibold">{text}</h3>
{/snippet}

{#snippet chips(list: string[], mono = false)}
  <ul class="flex flex-wrap gap-1">
    {#each list as item (item)}
      <li><Badge class={mono ? "font-mono" : undefined}>{item}</Badge></li>
    {/each}
  </ul>
{/snippet}

<article class="mx-auto flex max-w-4xl flex-col gap-7 px-4 pt-3 pb-8 @2xl:px-8 @2xl:pt-5">
  <div class="flex flex-col gap-4">
    <IconButton label="Back" class="-ml-1 self-start" onclick={onback}><ArrowLeftIcon weight="bold" /></IconButton>
    <div class="flex items-start gap-4">
      <IconTile {manifest} size="xl" />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h2 class="flex flex-wrap items-center gap-2 text-2xl leading-tight font-semibold">
          {manifest.name}
          {#if freshness === "new"}<Badge tone="primary">New</Badge>{:else if freshness === "updated"}<Badge tone="info">Updated</Badge>{/if}
        </h2>
        <p class="text-ui text-foreground/65">{category_label(manifest)}</p>
        <AppByline {manifest} />
        <StoreButton {manifest} size="md" labelled primary class="mt-2 flex-wrap" />
      </div>
    </div>

    {#if !solo}
      <div class="flex flex-wrap gap-1.5">
        <!-- Pins and widgets open the app on demand, so they don't need it installed (ADR-077). -->
        <Button size="sm" onclick={pin}><PushPinIcon weight="bold" /> {mobile ? "Add to home screen" : "Pin to desktop"}</Button>
          {#if !mobile}
            <Button
              size="sm"
              onclick={() => (settings.taskbar.pinned = on_taskbar ? without_pin(settings.taskbar.pinned, manifest.id) : with_pin(settings.taskbar.pinned, manifest.id))}
            >
              {#if on_taskbar}<PushPinSimpleSlashIcon weight="bold" /> Unpin from taskbar{:else}<PushPinSimpleIcon weight="bold" /> Pin to taskbar{/if}
            </Button>
          {/if}
          {#if manifest.widget}<Button size="sm" onclick={add_widget}><StickerIcon weight="bold" /> Add widget</Button>{/if}
        <Button size="sm" onclick={copy_link}><LinkSimpleIcon weight="bold" /> Copy solo link</Button>
        {#if installed && !is_core_app(manifest.id)}
          <Button size="sm" variant="quiet" onclick={(event) => void uninstall_app(manifest.id, { x: event.clientX, y: event.clientY })}>
            <PackageIcon weight="bold" /> Uninstall…
          </Button>
        {/if}
      </div>
    {/if}
  </div>

  <dl class="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] overflow-hidden rounded-xl bg-background-light ring-1 ring-foreground/8">
    {#each facts as fact (fact.label)}
      <div class="-mr-px -mb-px flex flex-col gap-0.5 border-r border-b border-foreground/8 px-3 py-2.5">
        <dt class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{fact.label}</dt>
        <dd class={cn("truncate text-ui font-medium", fact.mono && "font-mono")}>{fact.value}</dd>
      </div>
    {/each}
  </dl>

  <div class="grid gap-3 @xl:grid-cols-2">
    {#if story.problem}
      <section class="flex flex-col gap-1.5 rounded-xl bg-background-light p-4 ring-1 ring-foreground/8">
        <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">The problem</h3>
        <p class="text-sm text-pretty">{story.problem}</p>
      </section>
    {/if}
    <section class={cn("flex flex-col gap-1.5 rounded-xl bg-background-light p-4 ring-1 ring-primary/30", !story.problem && "@xl:col-span-2")}>
      <h3 class="flex items-center gap-1.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">
        <ArrowRightIcon class="size-3 text-primary" weight="bold" aria-hidden="true" /> What {manifest.name} does
      </h3>
      <p class="text-sm text-pretty">{manifest.description && manifest.description !== story.solution ? manifest.description : story.solution}</p>
    </section>
  </div>

  {#if manifest.preview}
    {#await manifest.preview() then image}
      <img src={image.default} alt="{manifest.name} in use" class="aspect-video w-full rounded-xl bg-background-darker object-cover ring-1 ring-foreground/8" />
    {/await}
  {/if}

  {#await manifest.highlights?.() then module}
    {#if module?.default.length}
      <section class="flex flex-col gap-2">
        {@render heading("Highlights")}
        <ul class="grid gap-2 @xl:grid-cols-2">
          {#each module.default as highlight (highlight.title)}
            <li class="flex gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8">
              <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                <highlight.icon class="size-4.5" weight="duotone" />
              </span>
              <div class="min-w-0">
                <h4 class="text-ui font-semibold">{highlight.title}</h4>
                <p class="text-2xs text-pretty text-foreground/80">{highlight.text}</p>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/await}

  <section class="flex flex-col gap-2" aria-labelledby="achievements">
    <div class="flex items-baseline gap-2">
      <h3 id="achievements" class="text-base leading-tight font-semibold">Achievements</h3>
      <span class="font-mono text-2xs text-foreground/80">{unlocked_count} of {achievements_list.length}</span>
    </div>
    <AchievementList entries={achievements_list} />
    {#if usage}
      <p class="text-2xs text-foreground/80">Last {game ? "played" : "used"} {format_date(new Date(usage.last))}, on {usage.days} day{usage.days === 1 ? "" : "s"} so far.</p>
    {:else}
      <p class="text-2xs text-foreground/80">Time counts while one of its windows is in front. It stays on this device.</p>
    {/if}
  </section>

  {#if history.changes.length || history.added}
    <section class="flex flex-col gap-2">
      {@render heading("What's new")}
      <ol class="flex flex-col">
        {#each changes as { release, change }, index (index)}
          <li class="flex flex-col gap-1 border-b border-foreground/8 py-2 first:pt-0">
            <div class="flex items-center gap-2">
              <Badge tone={KINDS[change.kind].tone}>{KINDS[change.kind].label}</Badge>
              <span class="font-mono text-2xs text-foreground/80">v{release.version}</span>
              <time class="ml-auto font-mono text-2xs text-foreground/80" datetime={release.date}>{day(release.date)}</time>
            </div>
            <p class="text-ui text-pretty">{change.text}</p>
          </li>
        {/each}
        {#if history.added && (show_all || history.changes.length <= HISTORY_PREVIEW)}
          <li class="flex items-center gap-2 pt-2 text-ui text-foreground/80">
            <SparkleIcon class="size-3.5 shrink-0 text-primary" weight="fill" />
            Added in <span class="font-mono text-2xs">v{history.added.version}</span>
            <time class="ml-auto font-mono text-2xs" datetime={history.added.date}>{day(history.added.date)}</time>
          </li>
        {/if}
      </ol>
      {#if history.changes.length > HISTORY_PREVIEW}
        <Button size="sm" variant="quiet" class="-ml-2 self-start" onclick={() => (show_all = !show_all)}>
          {show_all ? "Show less" : `Show all ${history.changes.length}`}
        </Button>
      {/if}
    </section>
  {/if}

  <section class="flex flex-col gap-3">
    {@render heading("Information")}
    <dl class="grid gap-x-6 gap-y-3 @xl:grid-cols-2">
      {#if types.opens.length}
        <div class="flex flex-col gap-1"><dt class="text-2xs text-foreground/80">Opens</dt><dd>{@render chips(types.opens, true)}</dd></div>
      {/if}
      {#if types.works_on.length}
        <div class="flex flex-col gap-1"><dt class="text-2xs text-foreground/80">Works on, from Open with</dt><dd>{@render chips(types.works_on, true)}</dd></div>
      {/if}
      {#if manifest.widget}
        <div class="flex flex-col gap-1">
          <dt class="text-2xs text-foreground/80">Widget</dt>
          <dd class="text-ui">
            {#if widget_size}
              <span class="font-mono">{widget_size.default.w}×{widget_size.default.h}</span>, resizable from
              <span class="font-mono">{widget_size.min.w}×{widget_size.min.h}</span> to <span class="font-mono">{widget_size.max.w}×{widget_size.max.h}</span> cells
            {:else}
              <span class="font-mono">{WIDGET_FALLBACK_SIZE.w}×{WIDGET_FALLBACK_SIZE.h}</span> cells, fixed size
            {/if}
          </dd>
        </div>
      {/if}
      {#if manifest.keywords?.length}
        <div class="flex flex-col gap-1"><dt class="text-2xs text-foreground/80">Keywords</dt><dd>{@render chips(manifest.keywords)}</dd></div>
      {/if}
      {#if commands.length}
        <div class="flex flex-col gap-1 @xl:col-span-2">
          <dt class="text-2xs text-foreground/80">Commands</dt>
          <dd>
            <ul class="flex flex-col gap-1">
              {#each commands as command (command.id)}
                <li class="flex min-w-0 items-baseline gap-2">
                  <span class="shrink-0 font-mono text-2xs">{command.id}</span>
                  <span class="truncate text-2xs text-foreground/80" title={command.description}>{command.description}</span>
                </li>
              {/each}
            </ul>
          </dd>
        </div>
      {/if}
      <div class="flex flex-col gap-1">
        <dt class="text-2xs text-foreground/80">Shell</dt>
        <dd class="font-mono text-2xs">app launch {manifest.id}</dd>
      </div>
    </dl>
  </section>

  {#if related.length}
    <ShelfView id="related-{manifest.id}" label="More in {category_label(manifest)}" apps={related} {onselect} />
  {/if}
</article>

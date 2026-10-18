<script lang="ts">
  import kernel, {
    load_metas,
    NotificationType,
    Platform,
    with_meta,
    type AppId,
    type AppMeta,
    type AppsService,
    type DesktopItem,
    type DesktopService,
    type NotificationsService,
  } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time, use_plays } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import {
    CalendarCheck as CalendarCheckIcon,
    ChartBar as ChartBarIcon,
    CheckCircle as CheckCircleIcon,
    Fire as FireIcon,
    GameController as GameControllerIcon,
    Play as PlayIcon,
    SquaresFour as SquaresFourIcon,
    Sticker as StickerIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { entries, format_duration, format_last_played, list_games, Sort, SORT_OPTIONS, sort_entries, streak, supports_daily, Tab, totals } from "./hub";
  import { use_today } from "./today.svelte";

  const { tab: initial_tab }: { tab?: Tab } = $props();

  const { app_id, window: win, storage } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const tab = storage.window<Tab>("tab", untrack(() => initial_tab ?? Tab.LIBRARY), z.enum(Tab));
  const sort = storage.persisted<Sort>("sort", Sort.RECENT, z.enum(Sort));
  const plays = use_plays();
  const today = use_today(() => win.is_visible);

  const TABS = [
    { value: Tab.LIBRARY, label: "Library", icon: SquaresFourIcon },
    { value: Tab.TODAY, label: "Today", icon: CalendarCheckIcon },
    { value: Tab.STATS, label: "Stats", icon: ChartBarIcon },
  ];

  let metas = $state.raw<ReadonlyMap<AppId, AppMeta>>(new Map());
  void load_metas(kernel.service<AppsService>("apps")).then((loaded) => (metas = loaded));

  const games = $derived(list_games([...apps.list()].map(([, manifest]) => with_meta(manifest, metas))));
  const library = $derived(sort_entries(entries(games, plays.value), sort.value));
  const dailies = $derived(games.filter((game) => supports_daily(game.props)).sort((a, b) => a.name.localeCompare(b.name)));
  const solved_today = $derived(plays.value.daily[today.value] ?? {});
  const solved_count = $derived(dailies.filter((game) => solved_today[game.id]).length);
  const current_streak = $derived(streak(plays.value, today.value));
  const total = $derived(totals(plays.value));
  const by_time = $derived(sort_entries(entries(games, plays.value), Sort.MOST_PLAYED).filter((entry) => entry.stats));
  const top_ms = $derived(Math.max(1, ...by_time.map((entry) => entry.stats?.ms ?? 0)));
  const today_label = $derived(new Date(`${today.value}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }));

  const can_pin = kernel.platform !== Platform.MOBILE;
  const widget = $derived(desktop.items().find((item): item is Extract<DesktopItem, { kind: "widget" }> => item.kind === "widget" && item.app_id === app_id));

  async function toggle_widget() {
    try {
      if (widget) {
        await desktop.remove_item(widget.name);
        notifications.notify(app_id, { type: NotificationType.INFO, title: "Removed from the desktop", message: widget.label });
      } else {
        await desktop.pin_widget(app_id, { label: "Game Hub" });
      }
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't change the desktop", message: String(reason) });
    }
  }
</script>

{#snippet game_icon(Icon: (typeof games)[number]["icon"], size: "sm" | "md")}
  <span class={cn("grid shrink-0 place-items-center rounded-xl bg-background shadow-raised ring-1 ring-foreground/10", size === "md" ? "size-11" : "size-8 rounded-lg")}>
    <Icon class={size === "md" ? "size-6" : "size-4.5"} weight="duotone" />
  </span>
{/snippet}

<div class="@container grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <Segmented bind:value={tab.value} options={TABS} label="View" size="sm" />
    <span class="flex-1"></span>
    {#if tab.value === Tab.LIBRARY}
      <Select bind:value={sort.value} options={SORT_OPTIONS} size="sm" class="w-34" aria-label="Sort games" />
    {/if}
    {#if can_pin}
      <Button
        variant="quiet"
        size="sm"
        pressed={widget !== undefined}
        title={widget ? "Game Hub is on the desktop. Click to remove it." : "Put your games, today's puzzles and your streak on the desktop."}
        onclick={toggle_widget}
      >
        <StickerIcon />{widget ? "On desktop" : "Add to desktop"}
      </Button>
    {/if}
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    {#if games.length === 0}
      <EmptyState icon={GameControllerIcon} title="No games installed" description="Games you add show up here." />
    {:else if tab.value === Tab.LIBRARY}
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 p-4">
        {#each library as { game, stats } (game.id)}
          <li class="flex">
            <button
              class="flex w-full items-start gap-3 rounded-xl bg-background-light p-3 text-left ring-1 ring-foreground/8 transition-[box-shadow,opacity] duration-150 hover:ring-foreground/20 focus-visible:outline-2 focus-visible:outline-cottontail active:opacity-70"
              onclick={() => apps.launch(game.id)}
            >
              {@render game_icon(game.icon, "md")}
              <span class="flex min-w-0 flex-1 flex-col self-stretch">
                <span class="truncate text-sm font-semibold">{game.name}</span>
                {#if game.description}<span class="mt-0.5 line-clamp-2 text-ui text-foreground/65">{game.description}</span>{/if}
                <span class="mt-auto flex items-center gap-2 pt-2 text-2xs text-foreground/65">
                  {#if stats}
                    <span class="font-mono tabular-nums text-foreground/80">{format_duration(stats.ms)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{format_last_played(stats.last)}</span>
                  {:else}
                    <span>Not played yet</span>
                  {/if}
                  {#if supports_daily(game.props)}
                    <span class={cn("ml-auto flex items-center gap-1", solved_today[game.id] && "text-success")}>
                      {#if solved_today[game.id]}<CheckCircleIcon class="size-3.5" weight="fill" />{:else}<CalendarCheckIcon class="size-3.5" />{/if}Daily
                    </span>
                  {/if}
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {:else if tab.value === Tab.TODAY}
      {#if dailies.length === 0}
        <EmptyState icon={CalendarCheckIcon} title="No daily puzzles yet" description="When a game offers a puzzle of the day, it shows up here, the same for everyone." />
      {:else}
        <div class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 @md:px-6">
          <header class="flex items-center gap-4">
            <div class="min-w-0 flex-1">
              <h1 class="text-lg font-semibold">{today_label}</h1>
              <p class="text-ui text-foreground/65">
                {solved_count === dailies.length ? "All solved. New puzzles at midnight." : `${solved_count} of ${dailies.length} solved`}
              </p>
            </div>
            <div class={cn("flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 ring-1", current_streak ? "bg-primary/10 ring-primary/25" : "bg-background-light ring-foreground/8")}>
              <FireIcon class={cn("size-6", current_streak ? "text-primary" : "text-foreground/45")} weight={current_streak ? "fill" : "regular"} />
              <div class="leading-tight">
                <p class="font-mono text-base font-semibold tabular-nums">{current_streak}</p>
                <p class="text-2xs text-foreground/65">day streak</p>
              </div>
            </div>
          </header>

          <Section title="Puzzles of the day">
            <ul class="divide-y divide-foreground/8">
              {#each dailies as game (game.id)}
                {@const solved = solved_today[game.id]}
                <li class="flex items-center gap-3 px-4 py-2.5">
                  {@render game_icon(game.icon, "sm")}
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-ui font-medium">{game.name}</p>
                    {#if solved}
                      <p class="flex items-center gap-1 text-2xs text-success"><CheckCircleIcon class="size-3.5" weight="fill" />Solved in <span class="font-mono tabular-nums">{format_time(solved.ms)}</span>{#if solved.score !== undefined}<span aria-hidden="true">·</span>Score <span class="font-mono tabular-nums">{solved.score}</span>{/if}</p>
                    {:else}
                      <p class="text-2xs text-foreground/65">Not solved yet</p>
                    {/if}
                  </div>
                  <Button variant={solved ? "secondary" : "primary"} size="sm" onclick={() => apps.launch(game.id, { daily: today.value })}>
                    <PlayIcon weight="fill" />{solved ? "Again" : "Play"}
                  </Button>
                </li>
              {/each}
            </ul>
          </Section>
        </div>
      {/if}
    {:else if total.sessions === 0 && total.ms === 0}
      <EmptyState icon={ChartBarIcon} title="Nothing played yet" description="Play time and sessions show up here once you play a game." />
    {:else}
      <div class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 @md:px-6">
        <dl class="grid grid-cols-2 gap-3 @md:grid-cols-4">
          {#each [{ label: "Play time", value: format_duration(total.ms) }, { label: "Sessions", value: String(total.sessions) }, { label: "Games played", value: `${total.played} of ${games.length}` }, { label: "Dailies solved", value: String(total.dailies) }] as tile (tile.label)}
            <div class="rounded-xl bg-background-light px-4 py-3 ring-1 ring-foreground/8">
              <dt class="text-2xs text-foreground/65">{tile.label}</dt>
              <dd class="mt-0.5 font-mono text-lg font-semibold tabular-nums">{tile.value}</dd>
            </div>
          {/each}
        </dl>

        <Section title="By game">
          <ul class="divide-y divide-foreground/8">
            {#each by_time as { game, stats } (game.id)}
              <li class="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 px-4 py-2.5">
                {@render game_icon(game.icon, "sm")}
                <div class="min-w-0">
                  <div class="flex items-baseline justify-between gap-3">
                    <p class="truncate text-ui font-medium">{game.name}</p>
                    <p class="shrink-0 font-mono text-ui tabular-nums">{format_duration(stats?.ms ?? 0)}</p>
                  </div>
                  <div class="mt-1 h-1 overflow-hidden rounded-full bg-foreground/8">
                    <div class="h-full rounded-full bg-primary" style:width="{((stats?.ms ?? 0) / top_ms) * 100}%"></div>
                  </div>
                  <p class="mt-1 text-2xs text-foreground/65">
                    <span class="font-mono tabular-nums">{stats?.sessions ?? 0}</span>
                    {stats?.sessions === 1 ? "session" : "sessions"} · {format_last_played(stats?.last ?? "")}
                  </p>
                </div>
                <IconButton size="sm" label="Play {game.name}" onclick={() => apps.launch(game.id)}><PlayIcon weight="fill" /></IconButton>
              </li>
            {/each}
          </ul>
        </Section>
      </div>
    {/if}
  </div>

  <StatusBar>
    <span>{games.length} {games.length === 1 ? "game" : "games"}</span>
    <span>{format_duration(total.ms)} played</span>
    {#if dailies.length}<span class="hidden @sm:inline">{current_streak} day streak</span>{/if}
  </StatusBar>
</div>

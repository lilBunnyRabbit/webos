<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, Spinner, Toolbar } from "$lib/core/components/ui";
  import { track_play } from "$kit/games";
  import { report_error } from "$kit/utils/report-error";
  import { MapTrifold as MapIcon, Signpost as SignpostIcon } from "phosphor-svelte";
  import { untrack, type Component } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { z } from "zod";
  import { DriveSettings } from "./core/settings.svelte";
  import { Vehicle } from "./core/vehicle";
  import { game_of, GAMES, is_daily_game, YARD, type DailyGame, type GameChoice } from "./games";
  import type { GameProps } from "./games/define";
  import Yard from "./hub/yard.svelte";

  const { daily: daily_prop, game: game_prop, mode: mode_prop }: { daily?: string; game?: GameChoice; mode?: DailyGame } = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const { app_id, window: win, storage } = get_app_context();
  // One Game Hub session per window, whichever game or the yard is up.
  const play = track_play(app_id, () => win.is_visible);
  const settings = new DriveSettings(storage);
  const loaded = new SvelteMap<string, Component<GameProps>>();

  // A daily opens its game (`mode`, else a `game` with a daily, else parking); a game that hasn't shipped yet opens the yard.
  const first = untrack(() => {
    if (daily_prop) return mode_prop ?? (is_daily_game(game_prop) ? game_prop : "parking");
    return game_prop && game_of(game_prop) ? game_prop : YARD;
  });
  let active = $state<string>(first);
  let daily = $state(untrack(() => daily_prop));
  let from = $state<string | null>(null);
  let below = $state(false);
  let vehicle = $state<Vehicle>(Vehicle.HATCH);
  let last = $state<string | null>(storage.get("last", z.string()) ?? null);
  if (first !== YARD) remember(first);

  const loading = $derived(active === YARD ? null : (game_of(active) ?? null));
  const Game = $derived(active === YARD ? null : (loaded.get(active) ?? null));

  $effect(() => {
    const id = active;
    const game = game_of(id);
    if (!game || loaded.has(id)) return;
    let current = true;
    game.load().then(
      (module) => loaded.set(id, module.default),
      (reason: unknown) => {
        if (!current) return;
        report_error(app_id, `Couldn't open ${game.name}`, reason);
        open(YARD);
      }
    );
    return () => {
      current = false;
    };
  });

  function remember(id: string) {
    last = id;
    storage.set("last", id);
  }

  function open(id: string, from_below = false) {
    if (id === active) return;
    if (id === YARD) from = loaded.has(active) ? active : null;
    else {
      remember(id);
      below = from_below;
    }
    daily = undefined;
    active = id;
  }

  async function switch_game(event: MouseEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const choice = await dialogs.menu(
      [
        { id: YARD, label: "Yard", icon: MapIcon, disabled: active === YARD },
        ...GAMES.map((game) => ({
          id: game.id,
          label: game.id === last && game.id !== active ? `${game.name} · last` : game.name,
          icon: game.icon,
          disabled: game.id === active,
        })),
      ],
      { anchor: { x: box.left, y: box.bottom } }
    );
    if (choice) open(choice);
  }
</script>

{#snippet menu()}
  <Button size="sm" variant="quiet" aria-label="Games" title="Yard and games" onclick={switch_game}>
    <SignpostIcon weight="bold" />
    <span class="hidden @sm:inline">Games</span>
  </Button>
{/snippet}

{#if active === YARD}
  <Yard {settings} bind:vehicle {from} from_below={below} {last} {menu} onenter={open} />
{:else if Game}
  {#key active}
    <Game {settings} {daily} {menu} {play} onexit={() => open(YARD)} />
  {/key}
{:else if loading}
  <div class="grid h-full grid-rows-[auto_1fr] @container">
    <Toolbar>
      {@render menu()}
      <span class="truncate px-1 text-ui font-medium">{loading.name}</span>
    </Toolbar>
    <p class="flex items-center justify-center gap-2 text-ui text-foreground/65">
      <Spinner label="Loading {loading.name}" />Opening {loading.name}…
    </p>
  </div>
{/if}

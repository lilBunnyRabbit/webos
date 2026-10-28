<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { IconButton } from "$lib/core/components/ui";
  import { MapTrifold as MapIcon, Signpost as SignpostIcon } from "phosphor-svelte";
  import { untrack, type Component } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { z } from "zod";
  import { DriveSettings } from "./core/settings.svelte";
  import { Vehicle } from "./core/vehicle";
  import { game_of, GAMES, YARD, type GameChoice } from "./games";
  import type { GameProps } from "./games/define";
  import Yard from "./hub/yard.svelte";

  const { daily: daily_prop, game: game_prop }: { daily?: string; game?: GameChoice } = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const { storage } = get_app_context();
  const settings = new DriveSettings(storage);
  const loaded = new SvelteMap<string, Component<GameProps>>();

  // The daily is parking's; a game that hasn't shipped yet opens the yard.
  const first = untrack(() => (daily_prop ? "parking" : game_prop && game_of(game_prop) ? game_prop : YARD));
  let active = $state<string>(first);
  let daily = $state(untrack(() => daily_prop));
  let from = $state<string | null>(null);
  let vehicle = $state<Vehicle>(Vehicle.HATCH);
  let last = $state<string | null>(storage.get("last", z.string()) ?? null);
  if (first !== YARD) remember(first);

  const Game = $derived(active === YARD ? null : (loaded.get(active) ?? null));

  $effect(() => {
    const id = active;
    const game = game_of(id);
    if (!game || loaded.has(id)) return;
    void game.load().then((module) => loaded.set(id, module.default));
  });

  function remember(id: string) {
    last = id;
    storage.set("last", id);
  }

  function open(id: string) {
    if (id === active) return;
    if (id === YARD) from = active;
    else remember(id);
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
  <IconButton size="sm" label="Drive Hub: yard and games" onclick={switch_game}>
    <SignpostIcon weight="bold" />
  </IconButton>
{/snippet}

{#if active === YARD}
  <Yard {settings} bind:vehicle {from} {last} {menu} onenter={open} />
{:else if Game}
  {#key active}
    <Game {settings} {daily} {menu} onexit={() => open(YARD)} />
  {/key}
{/if}

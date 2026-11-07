import kernel, { type FilesService } from "$lib/core/api";
import { app_data_path } from "$lib/core/contexts/app";
import { SvelteMap } from "svelte/reactivity";
import type { Progress } from "../core/track";
import type { GameDefinition } from "../games/define";

/**
 * Each game's stars by id, read from its save and again whenever the app's data folder changes (a game saves as it
 * closes, after the yard is back). Call during component init.
 */
export function town_progress(app_id: string, games: readonly GameDefinition[]): ReadonlyMap<string, Progress> {
  const files = $derived(kernel.service<FilesService>("files"));
  const progress = new SvelteMap<string, Progress>();

  async function read(game: GameDefinition): Promise<Progress | null> {
    if (!game.progress) return null;
    const source = await game.progress();
    const file = await files.get_file(app_data_path(app_id, source.file));
    let save: unknown = null;
    try {
      save = file ? JSON.parse(await file.text()) : null;
    } catch {
      save = null;
    }
    return source.read(save);
  }

  $effect(() => {
    files.revision(app_data_path(app_id));
    let live = true;
    for (const game of games) {
      read(game).then(
        (got) => live && got && progress.set(game.id, got),
        () => {}
      );
    }
    return () => {
      live = false;
    };
  });

  return progress;
}

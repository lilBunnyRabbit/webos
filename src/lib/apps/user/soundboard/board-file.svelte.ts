import { app_data_path, json_file, type JsonFile } from "$lib/core/contexts/app";
import { BoardFileSchema, EMPTY_FILE, type BoardFile } from "./board";
import { APP_ID } from "./store";

function until_ready(file: JsonFile<BoardFile>): Promise<void> {
  if (file.ready) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = $effect.root(() => {
      $effect(() => {
        if (!file.ready) return;
        resolve();
        queueMicrotask(() => stop());
      });
    });
  });
}

/** The same shared cell an open window holds, so its board updates live. */
export async function with_board<R>(change: (file: JsonFile<BoardFile>) => R | Promise<R>): Promise<R> {
  const file = json_file(app_data_path(APP_ID, "board.json"), EMPTY_FILE, BoardFileSchema);
  try {
    await until_ready(file);
    if (file.error) throw new Error(`${file.error}. Open Soundboard and change the board to replace it.`);
    return await change(file);
  } finally {
    file.release();
  }
}

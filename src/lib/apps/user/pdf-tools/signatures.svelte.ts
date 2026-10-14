import kernel, { type FilesService } from "$lib/core/api";
import { untrack } from "svelte";
import { SIGNATURES_DIR, list_signatures, type SavedSignature } from "./pdf-files";
import { parent_path } from "$lib/core/api/services/files/path";

export interface SignatureList {
  readonly items: SavedSignature[];
  readonly ready: boolean;
}

// Call during component init: re-lists whenever the folder (or /home, where it gets created) changes.
export function watch_signatures(): SignatureList {
  let items = $state.raw<SavedSignature[]>([]);
  let ready = $state(false);
  let token = 0;

  $effect(() => {
    const files = kernel.service<FilesService>("files");
    files.revision(SIGNATURES_DIR);
    files.revision(parent_path(SIGNATURES_DIR));
    untrack(() => {
      const current = ++token;
      void list_signatures()
        .then((list) => {
          if (current === token) items = list;
        })
        .catch((error) => console.warn("[pdf-tools] Couldn't list signatures", error))
        .finally(() => {
          if (current === token) ready = true;
        });
    });
  });

  return {
    get items() {
      return items;
    },
    get ready() {
      return ready;
    },
  };
}

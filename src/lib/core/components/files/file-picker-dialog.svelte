<script lang="ts">
  import type { DialogProps } from "$lib/core/api";
  import { PATHS } from "$lib/core/api/services/files/hierarchy";
  import FileExplorer from "./file-explorer.svelte";

  export interface PickOptions {
    /** Extensions (".md") or MIME patterns ("image/*"); other files are shown but can't be chosen. */
    accept?: string[];
    /** Folder to start in. Defaults to /home. */
    start_path?: string;
  }

  export interface SaveOptions {
    /** Suggested file name. */
    name?: string;
    /** Only dims files that don't match; any name can still be typed. */
    accept?: string[];
    start_path?: string;
  }

  let {
    kind,
    accept,
    name,
    multiple = false,
    start_path = PATHS.home,
    title,
    resolve,
  }: DialogProps<string[]> &
    PickOptions & { kind: "file" | "directory" | "save"; name?: string; multiple?: boolean; title?: string } = $props();

  const TITLES = { file: "Open a file", directory: "Choose a folder", save: "Save as" };
</script>

<div class="flex h-[min(30rem,calc(100cqh-2rem))] w-[min(46rem,calc(100cqw-2rem))] flex-col overflow-hidden rounded-2xl bg-background shadow-popover">
  <div class="flex shrink-0 items-center gap-2 border-b border-foreground/8 bg-background-lighter px-4 py-2.5">
    <h2 class="text-ui font-semibold">{title ?? (kind === "file" && multiple ? "Open files" : TITLES[kind])}</h2>
    {#if accept?.length}<span class="truncate font-mono text-2xs text-foreground/80">{accept.join(" ")}</span>{/if}
  </div>
  <div class="min-h-0 flex-1 @container">
    <FileExplorer path={start_path} picker={{ kind, accept, name, multiple, onchoose: (paths) => resolve(paths), oncancel: () => resolve(null) }} />
  </div>
</div>

<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, EmptyState, Spinner } from "$lib/core/components/ui";
  import { track_play } from "$kit/games";
  import { cn, error_message } from "$lib/core/utils";
  import { WarningCircle as WarningCircleIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { blank_drawing } from "./drawing";
  import Editor from "./editor.svelte";
  import { NONOGRAM_EXTENSION, parse_nonogram, type Drawing } from "./file";
  import type { Mode, Size } from "./game";
  import { base_name } from "$lib/core/api/services/files/path";
  import Play, { type Source } from "./play.svelte";
  import { report_error } from "$kit/utils/report-error";

  const { path, daily, size, mode, edit }: { path?: string; daily?: string; size?: Size; mode?: Mode; edit?: boolean } = $props();

  const { app_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  // Window state survives session restore, so a restored window doesn't act on its launch request again.
  const handled = storage.window("handled", false);
  const request = untrack(() => (handled.value ? {} : { size, mode, edit }));
  handled.value = true;

  let source = $state<Source>(
    untrack(() => (daily ? { kind: "daily", day: daily } : { kind: "free", fresh: request.size || request.mode ? { size: request.size, mode: request.mode } : undefined }))
  );
  let loading = $state(untrack(() => Boolean(path)));
  let load_error = $state<string | null>(null);
  let editing = $state<{ drawing: Drawing; path: string | null } | null>(request.edit && !untrack(() => path) ? { drawing: blank_drawing(), path: null } : null);
  let testing = $state<Drawing | null>(null);
  let editor = $state<ReturnType<typeof Editor>>();

  const plays = track_play(app_id, () => win.is_visible && (!editing || testing !== null));

  async function read(target: string): Promise<Drawing> {
    const file = await files.get_file(target);
    if (!file) throw new Error(`Not found: ${target}`);
    const parsed = parse_nonogram(await file.text());
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.drawing;
  }

  $effect(() => {
    const target = untrack(() => path);
    if (!target) return;
    read(target)
      .then((drawing) => {
        source = { kind: "file", path: target, drawing };
        if (request.edit) editing = { drawing, path: target };
      })
      .catch((reason) => (load_error = error_message(reason)))
      .finally(() => (loading = false));
  });

  $effect(() => {
    if (editing) return;
    win.set_title(source.kind === "file" ? base_name(source.path) : null);
  });

  $effect(() =>
    win.on_back(() => {
      if (testing) testing = null;
      else if (editing) editor?.close();
      else return false;
      return true;
    })
  );

  async function open() {
    const chosen = await win.pick_file({ accept: [NONOGRAM_EXTENSION], title: "Open puzzle" });
    if (!chosen) return;
    try {
      source = { kind: "file", path: chosen, drawing: await read(chosen) };
      load_error = null;
    } catch (reason) {
      report_error(app_id, "Couldn't open the puzzle", reason);
    }
  }

  function on_solved(ms: number) {
    if (source.kind === "daily") plays.daily(source.day, ms);
  }

  function close_editor(saved: { path: string; drawing: Drawing } | null) {
    editing = null;
    if (saved) source = { kind: "file", ...saved };
  }
</script>

{#if loading}
  <div class="grid h-full place-items-center"><Spinner /></div>
{:else if load_error}
  <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't open the puzzle" description={load_error}>
    {#snippet actions()}
      <Button
        variant="primary"
        onclick={() => {
          load_error = null;
          source = { kind: "free" };
        }}>Play a new puzzle</Button
      >
    {/snippet}
  </EmptyState>
{:else}
  {#if editing}
    <div class={cn("h-full", testing && "hidden")}>
      <Editor
        bind:this={editor}
        drawing={editing.drawing}
        path={editing.path}
        testing={testing !== null}
        on_test={(drawing) => (testing = drawing)}
        on_close={close_editor}
      />
    </div>
  {/if}
  {#if testing}
    {#key testing}
      <Play source={{ kind: "test", drawing: testing }} on_back={() => (testing = null)} on_open={open} on_create={() => {}} on_free={() => {}} />
    {/key}
  {:else if !editing}
    {#key source}
      <Play
        {source}
        {on_solved}
        on_open={open}
        on_create={() => (editing = { drawing: blank_drawing(), path: null })}
        on_edit={() => source.kind === "file" && (editing = { drawing: source.drawing, path: source.path })}
        on_free={() => (source = { kind: "free" })}
      />
    {/key}
  {/if}
{/if}

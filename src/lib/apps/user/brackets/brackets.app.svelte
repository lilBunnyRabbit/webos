<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { base_name } from "$lib/core/api/services/files/path";
  import { Badge, Button, EmptyState, IconButton, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context, json_file, type JsonFile } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowLeft as ArrowLeftIcon,
    Devices as DevicesIcon,
    FileX as FileXIcon,
    FolderOpen as FolderOpenIcon,
    Plus as PlusIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import {
    BRACKETS_DIR,
    BracketFileSchema,
    create_bracket,
    EXTENSION,
    FORMAT_LABELS,
    FormatKind,
    MAX_NAME,
    player_names,
    type Bracket,
    type Format,
  } from "./bracket";
  import CupView from "./cup-view.svelte";
  import EliminationView from "./elimination-view.svelte";
  import NewBracket from "./new-bracket.svelte";
  import Podium from "./podium.svelte";
  import RoundRobinView from "./round-robin-view.svelte";
  import StartScreen from "./start-screen.svelte";
  import { can_pick, pick, record_race, undo, view_of } from "./state";
  import { list_brackets, parse_bracket, save_new, type BracketEntry } from "./store";
  import { report_error } from "$kit/utils/report-error";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window: win, storage } = get_app_context();

  const files = $derived(kernel.service<FilesService>("files"));

  const open_path = storage.window<string | null>("path", untrack(() => initial_path ?? null), z.string().nullable());
  let creating = $state(false);
  let busy = $state(false);

  let cell = $state.raw<JsonFile<Bracket | null> | null>(null);
  $effect(() => {
    const path = open_path.value;
    if (!path) return;
    const next = json_file(path, null, BracketFileSchema);
    cell = next;
    return () => {
      next.release();
      cell = null;
    };
  });

  const bracket = $derived(cell?.ready ? cell.value : null);
  const view = $derived(bracket ? view_of(bracket) : null);
  const names = $derived(bracket ? player_names(bracket) : new Map<string, string>());
  const seeds = $derived(new Map(bracket?.players.map((player, index) => [player.id, index + 1]) ?? []));

  let entries = $state.raw<BracketEntry[]>([]);
  let loaded = $state(false);
  let list_request = 0;

  $effect(() => {
    if (open_path.value || creating) return;
    files.revision(BRACKETS_DIR);
    untrack(async () => {
      const id = ++list_request;
      try {
        const next = await list_brackets(files);
        if (id === list_request) entries = next;
      } catch (reason) {
        console.warn("[Brackets] Couldn't list brackets:", reason);
      } finally {
        if (id === list_request) loaded = true;
      }
    });
  });

  $effect(() => win.set_title(open_path.value ? (bracket?.name ?? base_name(open_path.value)) : creating ? "New bracket" : null));

  $effect(() =>
    win.on_back(() => {
      if (creating) creating = false;
      else if (open_path.value) open_path.value = null;
      else return false;
      return true;
    })
  );

  function edit(change: (bracket: Bracket) => Bracket) {
    if (!cell?.value) return;
    const current = $state.snapshot(cell.value) as Bracket;
    const next = change(current);
    if (next !== current) cell.value = next;
  }

  async function create(name: string, players: string[], format: Format) {
    busy = true;
    try {
      const path = await save_new(files, create_bracket(name, players, format));
      creating = false;
      open_path.value = path;
    } catch (reason) {
      report_error(app_id, "Couldn't create the bracket", reason);
    } finally {
      busy = false;
    }
  }

  async function open_file() {
    const chosen = await win.pick_file({ accept: [EXTENSION], start_path: BRACKETS_DIR, title: "Open bracket" });
    if (chosen) open_path.value = chosen;
  }

  async function open_device() {
    const [file] = await pick_device_files({ accept: [EXTENSION] });
    if (!file) return;
    try {
      const parsed = parse_bracket(await file.text());
      if (!parsed) throw new Error("It isn't a valid bracket file.");
      open_path.value = await save_new(files, parsed);
    } catch (reason) {
      report_error(app_id, `Couldn't open ${file.name}`, reason);
    }
  }

  async function rename() {
    if (!bracket) return;
    const next = await win.prompt("Rename bracket", {
      initial: bracket.name,
      confirm_label: "Rename",
      validate: (value) => (value.trim() ? null : "Give it a name."),
    });
    if (next?.trim()) edit((current) => ({ ...current, name: next.trim().slice(0, MAX_NAME) }));
  }

  const editable = (match: string) => (bracket && view ? can_pick(bracket, view, match) : false);

  const progress = $derived.by(() => {
    if (!view) return "";
    const unit = view.kind === FormatKind.CUP ? "races" : "matches";
    return `${view.played} of ${view.total} ${unit}`;
  });
</script>

<div class="@container grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
  {#if open_path.value}
    <Toolbar>
      <IconButton label="All brackets" size="sm" onclick={() => (open_path.value = null)}><ArrowLeftIcon weight="bold" /></IconButton>
      <button
        type="button"
        class="min-w-0 truncate rounded-md px-1.5 py-1 text-left text-sm font-semibold hover:bg-foreground/6 focus-visible:outline-2 focus-visible:outline-cottontail"
        title="Rename"
        disabled={!bracket}
        onclick={rename}
      >
        {bracket?.name ?? base_name(open_path.value)}
      </button>
      {#if bracket}<Badge class="hidden @md:inline-flex">{FORMAT_LABELS[bracket.format.kind]}</Badge>{/if}
      <span class="flex-1"></span>
      <Button size="sm" variant="quiet" disabled={!bracket?.results.length} onclick={() => edit(undo)}>
        <ArrowCounterClockwiseIcon weight="bold" />Undo
      </Button>
    </Toolbar>
  {:else if creating}
    <Toolbar>
      <IconButton label="All brackets" size="sm" onclick={() => (creating = false)}><ArrowLeftIcon weight="bold" /></IconButton>
      <span class="min-w-0 flex-1 truncate px-1 text-sm font-semibold">New bracket</span>
    </Toolbar>
  {:else}
    <Toolbar>
      <span class="min-w-0 flex-1 truncate px-1 text-sm font-semibold">Brackets</span>
      <Button size="sm" variant="quiet" onclick={open_file}><FolderOpenIcon weight="bold" /><span class="hidden @md:inline">Open…</span></Button>
      <IconButton label="Open from device…" size="sm" onclick={open_device}><DevicesIcon weight="bold" /></IconButton>
      <Button size="sm" variant="primary" aria-label="New bracket" onclick={() => (creating = true)}>
        <PlusIcon weight="bold" /><span class="hidden @md:inline">New bracket</span>
      </Button>
    </Toolbar>
  {/if}

  <div class="min-h-0 overflow-auto">
    {#if open_path.value}
      {#if !cell?.ready}
        <div class="grid h-full place-items-center"><Spinner label="Loading" /></div>
      {:else if cell.error}
        <EmptyState icon={FileXIcon} tone="error" title="Couldn't read this bracket" description={cell.error}>
          {#snippet actions()}
            <Button onclick={() => (open_path.value = null)}>All brackets</Button>
          {/snippet}
        </EmptyState>
      {:else if !bracket || !view}
        <EmptyState icon={FileXIcon} title="This bracket is gone" description="It was moved or deleted.">
          {#snippet actions()}
            <Button onclick={() => (open_path.value = null)}>All brackets</Button>
          {/snippet}
        </EmptyState>
      {:else}
        {#if view.kind === FormatKind.ROUND_ROBIN || view.kind === FormatKind.CUP}
          <div class="flex flex-col gap-6 p-4">
            {#if view.finished}<div class="mx-auto w-full max-w-3xl"><Podium places={view.podium} {names} /></div>{/if}
            {#if view.kind === FormatKind.ROUND_ROBIN}
              <RoundRobinView {view} {names} onpick={(match, winner, score) => edit((current) => pick(current, match, winner, score))} />
            {:else}
              <CupView {view} {names} onrace={(race, order) => edit((current) => record_race(current, race, order))} />
            {/if}
          </div>
        {:else}
          <div class="flex min-h-full w-max min-w-full flex-col">
            {#if view.finished}
              <div class="sticky left-0 self-start p-4 pb-0"><Podium places={view.podium} {names} /></div>
            {/if}
            <EliminationView {view} {names} {seeds} {editable} onpick={(match, winner) => edit((current) => pick(current, match, winner))} />
          </div>
        {/if}
      {/if}
    {:else if creating}
      <NewBracket {busy} oncreate={create} oncancel={() => (creating = false)} />
    {:else}
      <StartScreen {entries} {loaded} onopen={(path) => (open_path.value = path)} onnew={() => (creating = true)} />
    {/if}
  </div>

  <StatusBar>
    {#if open_path.value && bracket}
      <span>{FORMAT_LABELS[bracket.format.kind]}</span>
      <span>{bracket.players.length} players</span>
      <span>{progress}</span>
      <span class="ml-auto hidden @md:inline">{base_name(open_path.value)}</span>
    {:else if !open_path.value && !creating}
      <span>{entries.length} {entries.length === 1 ? "bracket" : "brackets"} in Documents</span>
    {:else}
      <span>{EXTENSION} file in Documents</span>
    {/if}
  </StatusBar>
</div>

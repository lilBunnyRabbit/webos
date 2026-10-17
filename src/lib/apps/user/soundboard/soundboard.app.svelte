<script lang="ts">
  import kernel, { NotificationType, ShortcutCategory, type DialogsService, type FilesService, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Segmented, Select, Separator, Slider, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { has_drag_paths, read_drag_paths } from "$lib/core/components/files/drag";
  import { get_app_context } from "$lib/core/contexts/app";
  import { has_files } from "$lib/core/utils/image";
  import type { Position } from "$lib/core/utils/type";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowRight as ArrowRightIcon,
    DotsThree as DotsThreeIcon,
    FolderOpen as FolderOpenIcon,
    PencilSimple as PencilIcon,
    Play as PlayIcon,
    Plus as PlusIcon,
    Repeat as RepeatIcon,
    SpeakerHigh as SpeakerHighIcon,
    SpeakerX as SpeakerXIcon,
    SquaresFour as SquaresFourIcon,
    Stack as StackIcon,
    Stop as StopIcon,
    Textbox as TextboxIcon,
    Trash as TrashIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { z } from "zod";
  import {
    BoardFileSchema,
    create_pad,
    DEFAULT_BOARD_ID,
    DEFAULT_VOLUME,
    EMPTY_FILE,
    free_keys,
    is_audio,
    move_pad,
    PlayMode,
    PlayModeSchema,
    sound_in_use,
    sounds_freed_by_board,
    unique_board_name,
    VolumeSchema,
    type Board,
    type Pad,
  } from "./board";
  import PadDialog, { type PadEdit } from "./pad-dialog.svelte";
  import PadTile from "./pad-tile.svelte";
  import { acquire_player } from "./player.svelte";
  import { delete_sound, import_sound } from "./store";
  import { error_message } from "$lib/core/utils";

  const ACCEPT = ["audio/*"];
  const MODE_OPTIONS = [
    { value: PlayMode.RESTART, label: "Restart", icon: ArrowCounterClockwiseIcon },
    { value: PlayMode.OVERLAP, label: "Overlap", icon: StackIcon },
  ];
  const PAD_TYPE = "application/x-soundboard-pad";

  const { path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  const data = storage.file("board.json", EMPTY_FILE, BoardFileSchema);
  const volume = storage.persisted("volume", DEFAULT_VOLUME, VolumeSchema);
  const mode = storage.persisted<PlayMode>("mode", PlayMode.RESTART, PlayModeSchema);
  const active_id = storage.window("board", DEFAULT_BOARD_ID, z.string());
  const imported = storage.window("imported", false, z.boolean());

  const board = $derived(data.value.boards.find((entry) => entry.id === active_id.value) ?? data.value.boards[0]);
  const board_options = $derived(data.value.boards.map((entry) => ({ value: entry.id, label: entry.name })));

  const { player, release } = acquire_player();
  onDestroy(release);
  $effect(() => player.set_volume(volume.value));
  $effect(() => {
    player.mode = mode.value;
  });

  let root = $state<HTMLDivElement>();
  let busy = $state(0);
  let dropping = $state(false);
  let dragged = $state<string | null>(null);
  let drop_index = $state<number | null>(null);

  const playing_count = $derived([...player.playing.values()].reduce((sum, state) => sum + state.count, 0));

  function report(title: string, reason: unknown) {
    console.error(`[Soundboard] ${title}`, reason);
    notifications.notify(app_id, { type: NotificationType.ERROR, title, message: error_message(reason) });
  }

  async function play(pad: Pad) {
    try {
      await player.trigger(pad);
    } catch (reason) {
      report(`Couldn't play “${pad.label}”`, reason);
    }
  }

  async function add_files(list: File[]) {
    const audio = list.filter((file) => is_audio(file.name, file.type));
    if (audio.length < list.length) {
      notifications.notify(app_id, {
        type: NotificationType.WARNING,
        title: audio.length ? "Some files were skipped" : "That isn't an audio file",
        message: "Only audio files can go on the board.",
      });
    }
    if (!audio.length) return;
    busy++;
    try {
      for (const file of audio) {
        const sound = await import_sound(files, file);
        const target = data.value.boards.find((entry) => entry.id === board.id) ?? board;
        target.pads.push(create_pad(target.pads, sound, file.name, crypto.randomUUID()));
      }
    } catch (reason) {
      report("Couldn't add the sound", reason);
    } finally {
      busy--;
    }
  }

  async function add_paths(paths: string[]) {
    const found = await Promise.all(paths.map((entry) => files.get_file(entry)));
    await add_files(found.filter((file): file is File => file !== null));
  }

  async function add_from_files() {
    const chosen = await win.pick_file({ accept: ACCEPT, title: "Add sounds", multiple: true });
    if (chosen.length) await add_paths(chosen);
  }

  // "Open with Soundboard" adds the file once; a restored window keeps the flag and doesn't add it again.
  $effect(() => {
    if (!data.ready || !path || imported.value) return;
    untrack(() => {
      imported.value = true;
      void add_paths([path]);
    });
  });

  function find_pad(id: string): Pad | undefined {
    return board.pads.find((pad) => pad.id === id);
  }

  async function edit(pad: Pad) {
    const result = await dialogs.show(
      PadDialog,
      { pad: $state.snapshot(pad), keys: free_keys(board.pads, pad.id), preview: (draft: Pad) => void play({ ...draft, id: `preview-${draft.id}` }) },
      { window: window_id }
    );
    player.stop(`preview-${pad.id}`);
    if (!result) return;
    if (result.action === "delete") return remove(pad);
    const current = find_pad(pad.id);
    if (!current) return;
    Object.assign(current, result.pad);
    player.set_loop(pad.id, result.pad.loop);
  }

  async function remove(pad: Pad) {
    const confirmed = await win.confirm(`Delete “${pad.label}”?`, {
      detail: "The pad and its copy of the sound are deleted. The original file isn't touched.",
      confirm_label: "Delete",
      danger: true,
    });
    if (!confirmed) return;
    player.stop(pad.id);
    const keep = sound_in_use(data.value, pad.sound, pad.id);
    board.pads = board.pads.filter((entry) => entry.id !== pad.id);
    if (keep) return;
    player.forget(pad.sound);
    try {
      await delete_sound(files, pad.sound);
    } catch (reason) {
      report("Couldn't delete the sound file", reason);
    }
  }

  function move(pad: Pad, offset: number) {
    const index = board.pads.findIndex((entry) => entry.id === pad.id);
    board.pads = move_pad(board.pads, pad.id, index + offset);
  }

  function toggle_loop(pad: Pad) {
    pad.loop = !pad.loop;
    player.set_loop(pad.id, pad.loop);
  }

  async function pad_menu(pad: Pad, anchor: Position) {
    const index = board.pads.indexOf(pad);
    const choice = await dialogs.menu(
      [
        { id: "play", label: "Play", icon: PlayIcon, shortcut: pad.key?.toUpperCase() },
        { id: "edit", label: "Edit…", icon: PencilIcon },
        { id: "loop", label: pad.loop ? "Stop looping" : "Loop", icon: RepeatIcon },
        { separator: true },
        { id: "earlier", label: "Move earlier", icon: ArrowLeftIcon, disabled: index <= 0 },
        { id: "later", label: "Move later", icon: ArrowRightIcon, disabled: index >= board.pads.length - 1 },
        { separator: true },
        { id: "delete", label: "Delete…", icon: TrashIcon, danger: true },
      ],
      { anchor }
    );
    if (choice === "play") void play(pad);
    else if (choice === "edit") void edit(pad);
    else if (choice === "loop") toggle_loop(pad);
    else if (choice === "earlier") move(pad, -1);
    else if (choice === "later") move(pad, 1);
    else if (choice === "delete") void remove(pad);
  }

  async function new_board() {
    const name = await win.prompt("New board", { initial: unique_board_name(data.value.boards, "My board"), confirm_label: "Create" });
    if (!name) return;
    const created: Board = { id: crypto.randomUUID(), name, pads: [] };
    data.value.boards.push(created);
    active_id.value = created.id;
  }

  async function rename_board() {
    const name = await win.prompt("Rename board", { initial: board.name, confirm_label: "Rename" });
    if (name) board.name = name;
  }

  async function delete_board() {
    const target = board;
    const confirmed = await win.confirm(`Delete “${target.name}”?`, {
      detail: target.pads.length ? `Its ${target.pads.length} pads and their sounds are deleted.` : "The board is empty.",
      confirm_label: "Delete",
      danger: true,
    });
    if (!confirmed) return;
    const freed = sounds_freed_by_board(data.value, target.id);
    for (const pad of target.pads) player.stop(pad.id);
    data.value.boards = data.value.boards.filter((entry) => entry.id !== target.id);
    active_id.value = data.value.boards[0].id;
    try {
      for (const sound of freed) {
        player.forget(sound);
        await delete_sound(files, sound);
      }
    } catch (reason) {
      report("Couldn't delete the sound files", reason);
    }
  }

  async function board_menu(event: MouseEvent & { currentTarget: HTMLElement }) {
    const rect = event.currentTarget.getBoundingClientRect();
    const choice = await dialogs.menu(
      [
        { id: "new", label: "New board…", icon: PlusIcon },
        { id: "rename", label: "Rename board…", icon: TextboxIcon },
        { separator: true },
        { id: "delete", label: "Delete board…", icon: TrashIcon, danger: true, disabled: data.value.boards.length <= 1 },
      ],
      { anchor: { x: rect.left, y: rect.bottom + 4 } }
    );
    if (choice === "new") void new_board();
    else if (choice === "rename") void rename_board();
    else if (choice === "delete") void delete_board();
  }

  $effect(() => {
    const no_sheet = () => dialogs.for_window(window_id).length === 0;
    const disposers = [
      shortcuts.register({ id: "soundboard.stop", keys: "esc", label: "Stop all sounds", category: ShortcutCategory.APP, window: window_id, run: () => player.stop_all(), when: no_sheet }),
      ...board.pads
        .filter((pad) => pad.key)
        .map((pad) =>
          shortcuts.register({
            id: `soundboard.pad.${pad.id}`,
            keys: pad.key!,
            label: `Play “${pad.label}”`,
            category: ShortcutCategory.APP,
            window: window_id,
            run: () => void play(pad),
            when: no_sheet,
          })
        ),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  function on_dragover(event: DragEvent) {
    if (dragged || !(has_files(event) || has_drag_paths(event))) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    dropping = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!root?.contains(event.relatedTarget as Node | null)) dropping = false;
  }

  function on_drop(event: DragEvent) {
    if (dragged) return;
    dropping = false;
    if (has_drag_paths(event)) {
      event.preventDefault();
      void add_paths(read_drag_paths(event));
    } else if (has_files(event)) {
      event.preventDefault();
      void add_files(Array.from(event.dataTransfer?.files ?? []));
    }
  }

  function pad_dragstart(event: DragEvent, pad: Pad) {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(PAD_TYPE, pad.id);
    event.dataTransfer.effectAllowed = "move";
    dragged = pad.id;
  }

  function grid_dragover(event: DragEvent) {
    if (!dragged || !event.dataTransfer?.types.includes(PAD_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const tile = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (tile) drop_index = Number(tile.dataset.index);
  }

  function grid_drop(event: DragEvent) {
    if (!dragged) return;
    event.preventDefault();
    if (drop_index !== null) board.pads = move_pad(board.pads, dragged, drop_index);
    dragged = null;
    drop_index = null;
  }
</script>

<div
  bind:this={root}
  role="presentation"
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    <Select size="sm" aria-label="Board" options={board_options} bind:value={active_id.value} class="w-36 overflow-hidden whitespace-nowrap @md:w-44" />
    <IconButton label="Board options" size="sm" onclick={board_menu}><DotsThreeIcon weight="bold" /></IconButton>
    <span class="flex-1"></span>
    <Button size="sm" variant="primary" aria-label="Add sounds…" title="Add sounds…" onclick={add_from_files}><PlusIcon weight="bold" /><span class="hidden @md:inline">Add sounds…</span></Button>
    <Separator vertical class="hidden @md:block" />
    <IconButton label="Stop all (Esc)" size="sm" disabled={playing_count === 0} onclick={() => player.stop_all()}><StopIcon weight="fill" /></IconButton>
    <Segmented size="sm" label="Pressing a playing pad again" options={MODE_OPTIONS} bind:value={mode.value} />
    <label class="flex min-w-36 flex-1 items-center gap-2 px-1 text-foreground/80 @md:flex-none @md:px-0" title="Master volume">
      <span class="sr-only">Master volume</span>
      {#if volume.value === 0}<SpeakerXIcon class="size-4 shrink-0" weight="bold" />{:else}<SpeakerHighIcon class="size-4 shrink-0" weight="bold" />{/if}
      <Slider min={0} max={1} step={0.01} bind:value={volume.value} size="sm" class="flex-1 @md:w-28 @md:flex-none" />
    </label>
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    {#if !data.ready}
      <div class="grid h-full place-items-center"><Spinner label="Loading the board" /></div>
    {:else if data.error}
      <EmptyState icon={WarningIcon} tone="error" title="Couldn't read the board" description="{data.error}. Changing the board replaces the file." />
    {:else if board.pads.length === 0}
      <EmptyState
        icon={SquaresFourIcon}
        title="No sounds on this board"
        description="Add audio from your files or your device, or drop it here. Each sound is copied into the board, so moving the original won't break it."
      >
        {#snippet actions()}
          <Button variant="primary" onclick={add_from_files}><FolderOpenIcon weight="bold" /> Add sounds…</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <div
        role="list"
        aria-label={board.name}
        class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 p-3 @md:gap-3 @md:p-4 @2xl:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]"
        ondragover={grid_dragover}
        ondrop={grid_drop}
      >
        {#each board.pads as pad, index (pad.id)}
          <div data-index={index} class="min-w-0">
            <PadTile
              {pad}
              state={player.playing.get(pad.id)}
              dragging={dragged === pad.id}
              drop_target={dragged !== null && dragged !== pad.id && drop_index === index}
              onplay={() => play(pad)}
              onmenu={(point) => pad_menu(pad, point)}
              ondragstart={(event) => pad_dragstart(event, pad)}
              ondragend={() => {
                dragged = null;
                drop_index = null;
              }}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <StatusBar>
    <span>{board.pads.length} {board.pads.length === 1 ? "sound" : "sounds"}</span>
    {#if busy}<span>Adding…</span>{:else if playing_count}<span class="text-foreground">{playing_count} playing</span>{/if}
    <span class="ml-auto hidden @md:block pointer-coarse:hidden">Esc stops all · right-click a pad to edit</span>
  </StatusBar>

  {#if dropping}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop to add sounds</span>
    </div>
  {/if}
</div>

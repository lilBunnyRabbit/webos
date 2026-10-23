<script lang="ts">
  import kernel, { Platform, type DialogsService, type FilesService } from "$lib/core/api";
  import { Badge, Button, IconButton, Input, Spinner } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn, format_datetime } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { has_files, image_files } from "$kit/utils/image";
  import { picture_data_url } from "$kit/utils/picture";
  import { caret_range_at_point } from "$kit/utils/caret";
  import { create_history, current as history_current, push as history_push, redo as history_redo, undo as history_undo, type History } from "$kit/utils/history";
  import {
    ArrowLeft as ArrowLeftIcon,
    CaretDown as CaretDownIcon,
    Camera as CameraIcon,
    Devices as DevicesIcon,
    FolderOpen as FolderOpenIcon,
    ImageSquare as ImageIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import { break_line } from "./format";
  import { tags_of, words_of, type Entry } from "./journal";
  import { caret_offsets, place_caret, read_body, restyle } from "./live-dom";
  import MoodDetails from "./mood-details.svelte";
  import MoodPicker from "./mood-picker.svelte";
  import type { Details } from "./mood";
  import type { JournalSession } from "./session.svelte";

  interface Props {
    session: JournalSession;
    entry: Entry;
    fresh: boolean;
    onback: () => void;
    onsaved: (entry: Entry) => void;
    ondelete: (entry: Entry, fresh: boolean) => void;
    onerror: (title: string, reason: unknown) => void;
  }

  let { session, entry, fresh, onback, onsaved, ondelete, onerror }: Props = $props();

  const { window: win } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const mobile = kernel.platform === Platform.MOBILE;

  let current = $state.raw<Entry>(untrack(() => entry));
  let unsaved = $state(false);
  let saving = $state(false);
  let is_fresh = untrack(() => fresh);
  let busy = $state(0);
  let dropping = $state(false);
  let root = $state<HTMLDivElement>();
  let caret: Range | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let details_open = $state(untrack(() => Boolean(entry.activities?.length || entry.energy !== undefined || entry.sleep !== undefined)));

  interface Snapshot {
    body: string;
    caret: number;
  }
  const HISTORY_LIMITS = { max_entries: 200, max_bytes: 2_000_000, size_of: (snapshot: Snapshot) => snapshot.body.length * 2 };
  let history: History<Snapshot> = create_history({ body: untrack(() => entry.body), caret: untrack(() => entry.body.length) });
  let burst: ReturnType<typeof setTimeout> | undefined;
  let composing = false;

  const tags = $derived(tags_of(current.body));
  const words = $derived(words_of(current.body));

  function image_for(id: string): HTMLImageElement {
    const image = document.createElement("img");
    image.alt = "Photo";
    image.draggable = false;
    image.dataset.media = id;
    session.media_url(id).then(
      (url) => (image.src = url),
      () => (image.alt = "Photo couldn't be opened")
    );
    return image;
  }

  function show(body: string, at: number | null) {
    if (!root) return;
    if (restyle(root, body, image_for) && at !== null) place_caret(root, at);
  }

  function commit() {
    clearTimeout(burst);
    burst = undefined;
    const at = root ? (caret_offsets(root)?.end ?? current.body.length) : current.body.length;
    if (history_current(history).body !== current.body) history = history_push(history, { body: current.body, caret: at }, HISTORY_LIMITS);
  }

  function apply(body: string, at: number) {
    show(body, null);
    if (root) place_caret(root, at);
    changed({ ...current, body });
  }

  function step(back: boolean) {
    if (burst) commit();
    const next = back ? history_undo(history) : history_redo(history);
    if (next === history) return;
    history = next;
    const snapshot = history_current(history);
    if (root) {
      root.replaceChildren();
      apply(snapshot.body, snapshot.caret);
    }
  }

  onMount(() => {
    show(current.body, null);
    if (is_fresh && root) {
      root.focus();
      const range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
    }
    return () => flush();
  });

  $effect(() => session.before_lock(flush));

  $effect(() => {
    const document = root?.ownerDocument;
    if (!document) return;
    const remember = () => {
      const selection = document.getSelection();
      if (!root || !selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (root.contains(range.commonAncestorContainer)) caret = range.cloneRange();
    };
    document.addEventListener("selectionchange", remember);
    return () => document.removeEventListener("selectionchange", remember);
  });

  function changed(next: Entry) {
    current = next;
    unsaved = true;
    clearTimeout(timer);
    timer = setTimeout(flush, 600);
  }

  function emit() {
    if (!root) return;
    const body = read_body(root);
    changed({ ...current, body });
    if (composing) return;
    show(body, caret_offsets(root)?.end ?? null);
    clearTimeout(burst);
    burst = setTimeout(commit, 700);
  }

  function on_keydown(event: KeyboardEvent) {
    if (!root || event.isComposing) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.altKey && (event.key.toLowerCase() === "z" || (event.key.toLowerCase() === "y" && !event.metaKey))) {
      event.preventDefault();
      step(event.key.toLowerCase() === "z" && !event.shiftKey);
      return;
    }
    if (event.key !== "Enter" || mod || event.altKey) return;
    event.preventDefault();
    const range = caret_offsets(root);
    if (!range) return;
    if (burst) commit();
    const edit = break_line(read_body(root), range.start, range.end, !event.shiftKey);
    apply(edit.body, edit.caret);
    commit();
  }

  function on_beforeinput(event: InputEvent) {
    if (event.inputType !== "historyUndo" && event.inputType !== "historyRedo") return;
    event.preventDefault();
    step(event.inputType === "historyUndo");
  }

  function set_details(patch: Details & { mood?: number }) {
    changed({ ...current, ...patch });
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
  }

  function flush() {
    clearTimeout(timer);
    if (!unsaved || session.locked) return;
    unsaved = false;
    saving = true;
    const snapshot = current;
    session
      .save(snapshot)
      .then((saved) => {
        is_fresh = false;
        onsaved(saved);
      })
      .catch((reason) => {
        unsaved = true;
        onerror("Couldn't save the entry", reason);
      })
      .finally(() => (saving = false));
  }

  async function insert_pictures(pictures: Blob[], at: Range | null = caret) {
    busy++;
    try {
      for (const picture of pictures) {
        const id = await session.add_media(await picture_data_url(picture));
        if (!root) return;
        const image = image_for(id);
        if (at && root.contains(at.commonAncestorContainer)) {
          at.deleteContents();
          at.insertNode(image);
        } else root.append(image);
        const after = document.createRange();
        after.setStartAfter(image);
        after.collapse(true);
        at = after;
        emit();
        commit();
      }
    } catch (reason) {
      onerror("Couldn't add the photo", reason);
    } finally {
      busy--;
    }
  }

  async function photo_menu(event: MouseEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const choice = await dialogs.menu(
      [
        ...(mobile ? [{ id: "camera", label: "Take a photo", icon: CameraIcon }] : []),
        { id: "device", label: mobile ? "Choose a picture" : "From this device…", icon: DevicesIcon },
        { id: "files", label: "From files…", icon: FolderOpenIcon },
      ],
      { anchor: { x: box.left, y: box.bottom + 4 } }
    );
    if (!choice) return;
    try {
      let pictures: Blob[] = [];
      if (choice === "camera" || choice === "device") {
        session.picking++;
        try {
          pictures = await pick_device_files(choice === "camera" ? { accept: ["image/*"], capture: "environment" } : { accept: ["image/*"], multiple: true });
        } finally {
          session.picking--;
        }
      } else {
        const paths = await win.pick_file({ accept: ["image/*"], multiple: true, title: "Add photos" });
        const files = kernel.service<FilesService>("files");
        for (const path of paths) {
          const file = await files.get_file(path);
          if (file) pictures.push(file);
        }
      }
      if (pictures.length) await insert_pictures(pictures);
    } catch (reason) {
      onerror("Couldn't add the photo", reason);
    }
  }

  function on_paste(event: ClipboardEvent) {
    const pictures = image_files(event.clipboardData);
    if (!pictures.length) return;
    event.preventDefault();
    void insert_pictures(pictures);
  }

  function on_drop(event: DragEvent) {
    dropping = false;
    if (!has_files(event)) return;
    event.preventDefault();
    const pictures = image_files(event.dataTransfer);
    if (pictures.length) void insert_pictures(pictures, caret_range_at_point(event.clientX, event.clientY));
  }

  async function remove() {
    if (!is_fresh && !(await win.confirm("Delete this entry?", { detail: "Its text and photos are deleted from this journal.", confirm_label: "Delete", danger: true }))) return;
    clearTimeout(timer);
    unsaved = false;
    ondelete(current, is_fresh);
  }
</script>

<article class="flex h-full min-h-0 flex-col" aria-label="Entry">
  <header class="flex flex-wrap items-center gap-2 border-b border-hairline px-2 py-1.5">
    <IconButton label="All entries" size="sm" class="@2xl:hidden" onclick={onback}><ArrowLeftIcon weight="bold" /></IconButton>
    <Input
      type="date"
      size="sm"
      class="w-auto font-mono"
      aria-label="Day"
      value={current.date}
      onchange={(event) => {
        if (event.currentTarget.value) {
          changed({ ...current, date: event.currentTarget.value });
          flush();
        }
      }}
    />
    <span class="flex-1"></span>
    {#if busy > 0 || saving}<Spinner label={busy > 0 ? "Adding photo" : "Saving"} />{/if}
    <IconButton label="Add photo" size="sm" onclick={photo_menu}><ImageIcon weight="bold" /></IconButton>
    <IconButton label="Delete entry" size="sm" onclick={remove}><TrashIcon weight="bold" /></IconButton>
  </header>

  <div class="grid gap-2 border-b border-hairline px-2 py-1.5">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <MoodPicker value={current.mood} onchange={(mood) => set_details({ mood })} label="Mood of this entry" />
      <span class="flex-1"></span>
      <Button variant="quiet" size="sm" aria-expanded={details_open} onclick={() => (details_open = !details_open)}>
        {current.activities?.length ? `${current.activities.length} ${current.activities.length === 1 ? "activity" : "activities"}` : "Activities, energy, sleep"}
        <CaretDownIcon weight="bold" class={cn("transition-transform", details_open && "rotate-180")} />
      </Button>
    </div>
    {#if details_open}
      <MoodDetails activities={session.activities} value={current} onchange={set_details} class="px-1 pb-1.5" />
    {/if}
  </div>

  <div class="relative min-h-0 flex-1 overflow-auto">
    <!-- svelte-ignore a11y_no_static_element_interactions (a drop target for photos on the text box itself) -->
    <div
      bind:this={root}
      role="textbox"
      tabindex="0"
      aria-multiline="true"
      aria-label="Entry text"
      contenteditable="plaintext-only"
      spellcheck="false"
      class={cn(
        "entry-editor mx-auto min-h-full max-w-2xl px-4 py-4 text-base leading-relaxed break-words whitespace-pre-wrap outline-none @md:px-8",
        dropping && "ring-2 ring-primary ring-inset"
      )}
      oninput={emit}
      onkeydown={on_keydown}
      onbeforeinput={on_beforeinput}
      oncompositionstart={() => (composing = true)}
      oncompositionend={() => {
        composing = false;
        emit();
      }}
      onpaste={on_paste}
      ondragover={(event) => {
        if (!has_files(event)) return;
        event.preventDefault();
        dropping = true;
      }}
      ondragleave={() => (dropping = false)}
      ondrop={on_drop}
    ></div>
    {#if !current.body.trim()}
      <span class="pointer-events-none absolute inset-x-0 top-4 mx-auto max-w-2xl px-4 text-base text-foreground/45 @md:px-8" aria-hidden="true">Write anything. #tags work inline.</span>
    {/if}
  </div>

  <footer class="flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-1.5 font-mono text-2xs text-foreground/80">
    <span>{words} {words === 1 ? "word" : "words"}</span>
    <span class="hidden @sm:inline">written {format_datetime(current.created)}</span>
    {#each tags as tag (tag)}<Badge tone="primary">#{tag}</Badge>{/each}
  </footer>
</article>

<style>
  .entry-editor :global(.md-h1) {
    font-size: 1.5em;
    font-weight: 600;
    line-height: 1.3;
  }

  .entry-editor :global(.md-h2) {
    font-size: 1.25em;
    font-weight: 600;
    line-height: 1.35;
  }

  .entry-editor :global(.md-h3) {
    font-size: 1.1em;
    font-weight: 600;
  }

  .entry-editor :global(.md-mark) {
    color: color-mix(in oklch, var(--foreground) 45%, transparent);
    font-weight: 400;
    font-style: normal;
  }

  .entry-editor :global(.md-bold) {
    font-weight: 650;
  }

  .entry-editor :global(.md-italic) {
    font-style: italic;
  }

  .entry-editor :global(.md-bullet) {
    color: var(--primary);
    font-weight: 600;
  }

  .entry-editor :global(.md-tag) {
    color: var(--primary);
  }

  .entry-editor :global(img) {
    display: block;
    max-width: 100%;
    max-height: 24rem;
    margin: 0.5rem 0;
    border-radius: var(--radius-md);
  }
</style>

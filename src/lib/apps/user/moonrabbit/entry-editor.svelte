<script lang="ts">
  import kernel, { Platform, type DialogsService, type FilesService } from "$lib/core/api";
  import { Badge, IconButton, Input, Spinner } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn, format_datetime } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { has_files, image_files } from "$kit/utils/image";
  import { picture_data_url } from "$kit/utils/picture";
  import { ArrowLeft as ArrowLeftIcon, Camera as CameraIcon, Devices as DevicesIcon, FolderOpen as FolderOpenIcon, ImageSquare as ImageIcon, Trash as TrashIcon } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import { media_token, split_media, tags_of, words_of, type Entry } from "./journal";
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

  function render(body: string) {
    root?.replaceChildren(...split_media(body).map((part) => ("text" in part ? document.createTextNode(part.text) : image_for(part.media))));
  }

  const BLOCKS = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "PRE"]);

  function read(node: Node): string {
    let text = "";
    for (const child of node.childNodes) {
      if (child instanceof Text) text += child.data;
      else if (child instanceof HTMLImageElement) text += child.dataset.media ? media_token(child.dataset.media) : "";
      else if (child instanceof HTMLBRElement) text += "\n";
      else if (child instanceof HTMLElement) {
        if (BLOCKS.has(child.tagName) && text && !text.endsWith("\n")) text += "\n";
        text += read(child);
      }
    }
    return text;
  }

  onMount(() => {
    render(current.body);
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
    if (root) changed({ ...current, body: read(root) });
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
    const position = document.caretPositionFromPoint(event.clientX, event.clientY);
    let range: Range | null = null;
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
    if (pictures.length) void insert_pictures(pictures, range);
  }

  async function remove() {
    if (!is_fresh && !(await win.confirm("Delete this entry?", { detail: "Its text and photos are deleted from this journal.", confirm_label: "Delete", danger: true }))) return;
    clearTimeout(timer);
    unsaved = false;
    ondelete(current, is_fresh);
  }
</script>

<article class="flex h-full min-h-0 flex-col" aria-label="Entry">
  <header class="flex flex-wrap items-center gap-2 border-b border-foreground/8 px-2 py-1.5">
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

  <div class="relative min-h-0 flex-1 overflow-auto">
    <!-- svelte-ignore a11y_no_static_element_interactions (a drop target for photos on the text box itself) -->
    <div
      bind:this={root}
      role="textbox"
      tabindex="0"
      aria-multiline="true"
      aria-label="Entry text"
      contenteditable="plaintext-only"
      class={cn(
        "entry-editor mx-auto min-h-full max-w-2xl px-4 py-4 text-base leading-relaxed break-words whitespace-pre-wrap outline-none @md:px-8",
        dropping && "ring-2 ring-primary ring-inset"
      )}
      oninput={emit}
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

  <footer class="flex flex-wrap items-center gap-2 border-t border-foreground/8 px-3 py-1.5 font-mono text-2xs text-foreground/80">
    <span>{words} {words === 1 ? "word" : "words"}</span>
    <span class="hidden @sm:inline">written {format_datetime(current.created)}</span>
    {#each tags as tag (tag)}<Badge tone="primary">#{tag}</Badge>{/each}
  </footer>
</article>

<style>
  .entry-editor :global(img) {
    display: block;
    max-width: 100%;
    max-height: 24rem;
    margin: 0.5rem 0;
    border-radius: var(--radius-md);
  }
</style>

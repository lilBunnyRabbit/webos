<script lang="ts">
  import { field } from "$lib/core/components/ui";
  import { has_files, image_files } from "$kit/utils/image";
  import { insert_image, range_at_point, read_runs, render_runs, toggle_display } from "./editor-dom";
  import { picture_data_url } from "$kit/utils/picture";
  import { ImageDisplay, is_empty, type Content } from "./model";

  interface Props {
    id: string;
    label: string;
    question: string;
    content: Content | undefined;
    onchange: (content: Content) => void;
    onerror: (reason: unknown) => void;
  }

  let { id, label, question, content, onchange, onerror }: Props = $props();

  let root = $state<HTMLDivElement>();
  let dropping = $state(false);
  let busy = $state(0);
  let emitted: Content | undefined;
  let caret: Range | null = null;

  const empty = $derived(is_empty(content));

  $effect(() => {
    const value = content;
    if (!root || value === emitted) return;
    render_runs(root, value ?? []);
    emitted = value;
  });

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

  function emit() {
    if (!root) return;
    const runs = read_runs(root);
    emitted = runs;
    onchange(runs);
  }

  export function insert(image: string, range: Range | null = caret) {
    if (!root) return;
    insert_image(root, range, image, ImageDisplay.INLINE);
    emit();
  }

  export async function insert_pictures(pictures: Blob[], range: Range | null = caret) {
    busy++;
    try {
      for (const picture of pictures) {
        const image = await picture_data_url(picture);
        insert(image, range);
        range = caret;
      }
    } catch (reason) {
      onerror(reason);
    } finally {
      busy--;
    }
  }

  function on_paste(event: ClipboardEvent) {
    const files = image_files(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    void insert_pictures(files);
  }

  function on_drag_over(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dropping = true;
  }

  function on_drop(event: DragEvent) {
    dropping = false;
    if (!has_files(event)) return;
    event.preventDefault();
    const files = image_files(event.dataTransfer);
    if (files.length) void insert_pictures(files, range_at_point(event.clientX, event.clientY));
  }

  function on_click(event: MouseEvent) {
    if (!(event.target instanceof HTMLImageElement) || !root?.contains(event.target)) return;
    toggle_display(event.target);
    emit();
  }
</script>

<div class="relative">
  <!-- svelte-ignore a11y_click_events_have_key_events (the keyboard edits the text; a click only toggles a picture) -->
  <div
    bind:this={root}
    {id}
    role="textbox"
    tabindex="0"
    aria-multiline="true"
    aria-label={label}
    aria-placeholder={question}
    aria-busy={busy > 0}
    contenteditable="plaintext-only"
    class={field({
      class: [
        "section-editor block h-auto min-h-16 py-2 leading-relaxed break-words whitespace-pre-wrap pointer-coarse:h-auto",
        dropping && "ring-2 ring-primary ring-inset",
      ],
    })}
    oninput={emit}
    onpaste={on_paste}
    ondragover={on_drag_over}
    ondragleave={() => (dropping = false)}
    ondrop={on_drop}
    onclick={on_click}
  ></div>
  {#if empty}
    <span class="pointer-events-none absolute top-2 left-2.5 right-2.5 truncate text-ui leading-relaxed text-foreground/45" aria-hidden="true">{question}</span>
  {/if}
</div>

<style>
  .section-editor :global(img) {
    display: inline;
    height: 2lh;
    width: auto;
    max-width: 100%;
    margin-inline: 0.125rem;
    vertical-align: middle;
    border-radius: var(--radius-sm);
    cursor: pointer;
    object-fit: contain;
  }

  .section-editor :global(img[data-display="block"]) {
    display: block;
    height: auto;
    max-height: 28rem;
    margin: 0.5rem 0;
    border-radius: var(--radius-md);
  }
</style>

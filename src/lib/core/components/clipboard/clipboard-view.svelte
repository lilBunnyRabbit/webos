<script lang="ts">
  import kernel, { Platform, type DialogProps, type WindowId } from "$lib/core/api";
  import { file_extension } from "$lib/core/api/services/files/path";
  import { format_bytes } from "$lib/core/utils";
  import { ClipboardText as ClipboardTextIcon, TextAa as TextIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { Button, Checkbox } from "../ui";
  import FileIcon from "../files/file-icon.svelte";
  import { accepts_file, clipboard_items, sheet_paste, type PasteFile, type PasteItem } from "./paste";

  interface Props extends DialogProps<PasteFile[]> {
    window_id: WindowId;
    items: PasteItem[];
    /** `false` when the browser refused to show the system clipboard; a Ctrl+V here still can. */
    readable: boolean;
    accept?: string[];
    multiple: boolean;
  }

  let { window_id, items: initial, readable: initially_readable, accept, multiple, resolve }: Props = $props();

  // The view owns its list from here: a Ctrl+V inside it swaps in what the paste event carries.
  let items = $state(untrack(() => initial));
  let readable = $state(untrack(() => initially_readable));

  const usable = (item: PasteItem): item is PasteFile => item.kind === "file" && accepts_file(accept, item.file);
  const chosen = new SvelteSet<PasteFile>(untrack(() => (multiple ? initial.filter(usable) : [])));

  const refused = kernel.platform === Platform.MOBILE ? "Allow clipboard access to see it." : "Allow clipboard access, or press Ctrl+V here.";

  function type_label(file: File): string {
    if (file.type) return file.type.split("/")[1].replace("+xml", "").toUpperCase();
    return file_extension(file.name).slice(1).toUpperCase() || "File";
  }

  function thumbnail(file: File) {
    return (image: HTMLImageElement) => {
      const url = URL.createObjectURL(file);
      image.src = url;
      return () => URL.revokeObjectURL(url);
    };
  }

  function move_focus(event: KeyboardEvent & { currentTarget: HTMLElement }) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-option]:not(:disabled)")];
    const index = rows.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLElement);
    const next = index === -1 ? 0 : event.key === "ArrowDown" ? index + 1 : index - 1;
    rows.at(next % rows.length)?.focus();
  }

  async function on_paste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []);
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!files.length && !text) return;
    event.preventDefault();
    const system: PasteItem[] = files.length ? files.map((file) => ({ kind: "file", file, path: null })) : [{ kind: "text", text }];
    items = await clipboard_items(system);
    readable = true;
    chosen.clear();
    if (multiple) for (const item of items.filter(usable)) chosen.add(item);
  }

  function toggle(item: PasteFile) {
    if (chosen.has(item)) chosen.delete(item);
    else chosen.add(item);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  role="group"
  aria-label="Paste"
  tabindex="-1"
  class="grid max-h-[min(32rem,calc(100cqh-1rem))] w-[min(26rem,calc(100cqw-1rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-2xl bg-background-lighter shadow-popover"
  onkeydown={move_focus}
  {@attach sheet_paste(window_id, on_paste)}
>
  <div class="px-4 pt-4 pb-2">
    <h2 class="text-sm font-semibold">Paste</h2>
    <p class="text-ui text-foreground/65">What's on the clipboard now{multiple ? ". Pick one or more." : "."}</p>
  </div>

  <div class="grid content-start gap-0.5 overflow-y-auto px-2 pb-2">
    {#each items as item, index (item)}
      {@const ok = usable(item)}
      {@const label = item.kind === "file" ? item.file.name : item.text.split("\n")[0]}
      <!-- svelte-ignore a11y_autofocus -->
      <button
        data-option
        disabled={!ok}
        autofocus={ok && items.findIndex(usable) === index}
        title={ok ? undefined : "Can't be opened here"}
        aria-pressed={multiple && item.kind === "file" ? chosen.has(item) : undefined}
        class="flex h-14 items-center gap-3 rounded-lg px-2 text-left transition-colors outline-none hover:bg-foreground/8 focus-visible:bg-foreground/10 disabled:opacity-38 disabled:hover:bg-transparent"
        onclick={() => {
          if (item.kind !== "file") return;
          if (multiple) toggle(item);
          else resolve([item]);
        }}
      >
        {#if multiple}<Checkbox checked={item.kind === "file" && chosen.has(item)} disabled={!ok} tabindex={-1} class="pointer-events-none" aria-hidden="true" />{/if}
        <span class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-background-darker ring-1 ring-foreground/8">
          {#if item.kind === "file" && item.file.type.startsWith("image/")}
            <img alt="" class="size-full object-cover" {@attach thumbnail(item.file)} />
          {:else if item.kind === "file"}
            <FileIcon name={item.file.name} kind="file" mime_type={item.file.type} class="size-5" />
          {:else}
            <TextIcon class="size-5" />
          {/if}
        </span>
        <span class="grid min-w-0 flex-1">
          <span class="truncate text-ui">{label}</span>
          <span class="truncate text-2xs text-foreground/65">
            {#if item.kind === "file"}
              {type_label(item.file)} · {format_bytes(item.file.size)} · {item.path ? "Copied in WebOS" : "Clipboard"}
            {:else}
              Text · {item.text.length} characters
            {/if}
          </span>
        </span>
      </button>
    {:else}
      <div class="grid justify-items-center gap-1 px-4 py-6 text-center">
        <ClipboardTextIcon class="size-6 text-foreground/65" />
        <p class="text-ui font-medium">Nothing to paste</p>
        <p class="text-2xs text-foreground/65">
          {readable ? "Copy an image or a file first." : `WebOS couldn't read the clipboard. ${refused}`}
        </p>
      </div>
    {/each}
    {#if items.length > 0 && !readable}
      <p class="px-2 pt-1 text-2xs text-foreground/65">The system clipboard isn't shown. {refused}</p>
    {/if}
  </div>

  <div class="flex justify-end gap-2 border-t border-foreground/8 px-3 py-2.5">
    <Button variant="quiet" onclick={() => resolve(null)}>Cancel</Button>
    {#if multiple}
      <Button variant="primary" disabled={chosen.size === 0} onclick={() => resolve(items.filter((item): item is PasteFile => item.kind === "file" && chosen.has(item)))}>
        {chosen.size > 1 ? `Paste ${chosen.size}` : "Paste"}
      </Button>
    {/if}
  </div>
</div>

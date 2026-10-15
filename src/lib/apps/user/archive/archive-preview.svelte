<script lang="ts">
  import { Button, EmptyState, IconButton, Spinner } from "$lib/core/components/ui";
  import { error_message, format_bytes, format_datetime } from "$lib/core/utils";
  import { File as FileIcon, Lightbulb as LightbulbIcon, Lock as LockIcon, X as XIcon } from "phosphor-svelte";
  import { PREVIEW_LIMIT, PreviewKind, TEXT_PREVIEW_CHARS, image_type, preview_kind } from "./preview";
  import { format_ratio } from "./tree";
  import { HOW_LIMIT } from "./views";
  import { Method } from "$lib/core/utils/zip/format";
  import { entry_blob, readable, type ZipEntry } from "$lib/core/utils/zip/read";

  type Loaded = { kind: "text"; text: string; truncated: boolean } | { kind: "image"; url: string } | { kind: "none"; reason: string };

  const { blob, entry, on_close, on_analyze }: { blob: Blob; entry: ZipEntry; on_close: () => void; on_analyze: (text: string) => void } = $props();

  const kind = $derived(preview_kind(entry.name));
  const name = $derived(entry.path.at(-1) ?? entry.name);
  let loaded = $state.raw<Loaded | null>(null);
  let failure = $state<string | null>(null);

  $effect(() => {
    const current = entry;
    const current_kind = kind;
    let url: string | null = null;
    let cancelled = false;
    loaded = null;
    failure = null;

    (async () => {
      if (!readable(current)) return { kind: "none", reason: current.encrypted ? "This file is password-protected." : "This file uses a compression method Archive can't read." } as const;
      if (current_kind === PreviewKind.NONE) return { kind: "none", reason: "No preview for this type of file." } as const;
      if (current.size > PREVIEW_LIMIT) return { kind: "none", reason: `Too large to preview (over ${format_bytes(PREVIEW_LIMIT)}).` } as const;
      const data = await entry_blob(blob, current);
      if (current_kind === PreviewKind.IMAGE) {
        url = URL.createObjectURL(new Blob([data], { type: image_type(current.name) }));
        return { kind: "image", url } as const;
      }
      const text = await data.text();
      return { kind: "text", text: text.slice(0, TEXT_PREVIEW_CHARS), truncated: text.length > TEXT_PREVIEW_CHARS } as const;
    })().then(
      (result) => {
        if (!cancelled) loaded = result;
      },
      (error) => {
        if (!cancelled) failure = error_message(error);
      }
    );

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  });
</script>

<div class="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
  <div class="flex h-11 items-center gap-2 border-b border-foreground/8 pr-1.5 pl-3">
    <span class="min-w-0 flex-1 truncate text-ui font-medium" title={entry.name}>{name}</span>
    {#if loaded?.kind === "text"}
      <Button size="sm" onclick={() => loaded?.kind === "text" && on_analyze(loaded.text.slice(0, HOW_LIMIT))}><LightbulbIcon weight="bold" /> How it compresses</Button>
    {/if}
    <IconButton label="Close preview" size="sm" onclick={on_close}><XIcon weight="bold" /></IconButton>
  </div>

  <div class="min-h-0 overflow-auto">
    {#if failure}
      <EmptyState icon={FileIcon} tone="error" title="Couldn't read this file" description={failure} />
    {:else if !loaded}
      <div class="grid h-full place-items-center"><Spinner label="Reading {name}" /></div>
    {:else if loaded.kind === "text"}
      <pre class="p-3 font-mono text-2xs leading-relaxed break-words whitespace-pre-wrap text-foreground/90">{loaded.text}{loaded.truncated ? "\n…" : ""}</pre>
    {:else if loaded.kind === "image"}
      <div class="checker grid min-h-full place-items-center p-3">
        <img src={loaded.url} alt={name} class="max-h-full max-w-full object-contain" />
      </div>
    {:else}
      <EmptyState icon={entry.encrypted ? LockIcon : FileIcon} title={name} description={loaded.reason} />
    {/if}
  </div>

  <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-foreground/8 px-3 py-2 font-mono text-2xs text-foreground/80 tabular-nums">
    <dt class="text-foreground/65">Size</dt>
    <dd class="truncate">{format_bytes(entry.size)} → {format_bytes(entry.compressed_size)} · saved {format_ratio(entry.size, entry.compressed_size)}</dd>
    <dt class="text-foreground/65">Method</dt>
    <dd>{entry.method === Method.DEFLATE ? "Deflate" : entry.method === Method.STORE ? "Stored" : `#${entry.method}`}</dd>
    <dt class="text-foreground/65">CRC-32</dt>
    <dd>{entry.crc.toString(16).padStart(8, "0")}</dd>
    <dt class="text-foreground/65">Modified</dt>
    <dd>{format_datetime(entry.modified)}</dd>
  </dl>
</div>

<style>
  .checker {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }
</style>

<script lang="ts">
  import { Button, Separator, Textarea, Toolbar } from "$lib/core/components/ui";
  import { cn, format_bytes } from "$lib/core/utils";
  import type { Snippet } from "svelte";
  import ArchiveHowHuffman from "./archive-how-huffman.svelte";
  import { lz77, lz77_segments, lz77_stats, source_range, type Lz77Match } from "./lz77";
  import { HOW_LIMIT, SAMPLE_TEXT } from "./views";
  import { deflate_raw } from "$lib/core/utils/zip/format";

  let { tabs, text = $bindable(), source = $bindable() }: { tabs: Snippet; text: string; source: string | null } = $props();

  const bytes = $derived(new TextEncoder().encode(text));
  const tokens = $derived(lz77(text));
  const stats = $derived(lz77_stats(tokens));
  let active = $state<number | null>(null);
  const active_match = $derived.by(() => {
    const token = active === null ? undefined : tokens[active];
    return token?.kind === "match" ? token : null;
  });
  const segments = $derived(lz77_segments(tokens, active_match ? source_range(active_match) : undefined));

  let deflated = $state<number | null>(null);
  $effect(() => {
    const input = bytes;
    let stale = false;
    const timer = setTimeout(() => {
      deflate_raw(input).then((out) => {
        if (!stale) deflated = out.length;
      });
    }, 150);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });

  const saved = $derived(deflated === null || !bytes.length ? null : Math.round((1 - deflated / bytes.length) * 100));
  const covered = $derived(stats.chars ? Math.round((stats.matched_chars / stats.chars) * 100) : 0);

  function describe(match: Lz77Match): string {
    const chars = match.length === 1 ? "character" : "characters";
    return `“${match.text}” is not stored again: it says “go back ${match.distance} and copy ${match.length} ${chars}”.`;
  }

  function reset() {
    text = SAMPLE_TEXT;
    source = null;
    active = null;
  }
</script>

<div class="grid h-full grid-rows-[auto_1fr]">
  <Toolbar>
    {@render tabs()}
    <span class="min-w-0 flex-1"></span>
    <Button size="sm" variant="quiet" onclick={reset} disabled={text === SAMPLE_TEXT}>Reset sample</Button>
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    <div class="mx-auto flex max-w-3xl flex-col gap-5 p-4 @md:p-6">
      <div class="flex flex-col gap-1.5">
        <h1 class="text-lg font-medium">How zip makes files smaller</h1>
        <p class="text-ui text-foreground/80">
          Zip's Deflate does two things. First <strong class="font-medium text-foreground">LZ77</strong> replaces text it has already seen with a short
          back-reference: “go back 23, copy 9”. Then <strong class="font-medium text-foreground">Huffman</strong> coding gives common symbols shorter codes. Both run below on your text.
        </p>
      </div>

      <label class="flex flex-col gap-1.5">
        <span class="flex items-baseline justify-between gap-2 text-ui">
          <span class="truncate">{source ? `From ${source}` : "Type or paste some text"}</span>
          <span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{Array.from(text).length} / {HOW_LIMIT}</span>
        </span>
        <Textarea bind:value={text} maxlength={HOW_LIMIT} mono rows={4} oninput={() => ((source = null), (active = null))} />
      </label>

      <dl class="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        {#each [
          { label: "Original", value: format_bytes(bytes.length) },
          { label: "Deflated", value: deflated === null ? "…" : format_bytes(deflated) },
          { label: "Saved", value: saved === null ? "—" : `${saved}%` },
          { label: "Repeats", value: `${stats.matches} · ${covered}% of text` },
        ] as stat (stat.label)}
          <div class="flex flex-col gap-0.5 rounded-lg bg-background-light px-3 py-2 shadow-card ring-1 ring-hairline">
            <dt class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{stat.label}</dt>
            <dd class="truncate font-mono text-sm tabular-nums">{stat.value}</dd>
          </div>
        {/each}
      </dl>

      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-foreground/65">
          <span class="flex items-center gap-1.5"><span class="h-3 w-4 rounded-xs bg-foreground/8"></span> stored as is</span>
          <span class="flex items-center gap-1.5"><span class="h-3 w-4 rounded-xs bg-primary/25"></span> copied from earlier</span>
          <span class="flex items-center gap-1.5"><span class="h-3 w-4 rounded-xs ring-2 ring-primary ring-inset"></span> where it was copied from</span>
        </div>
        <!-- Template whitespace would show under pre-wrap, so the runs sit on one line. -->
        <div role="presentation" class="min-h-24 rounded-lg bg-field p-3 ring-1 ring-hairline ring-inset font-mono text-ui leading-7 break-words whitespace-pre-wrap" onmouseleave={() => (active = null)}>{#each segments as segment, index (index)}{#if segment.kind === "match"}<!-- svelte-ignore a11y_no_noninteractive_tabindex --><mark
                tabindex="0"
                class={cn(
                  "rounded-xs bg-primary/25 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active === segment.token && "bg-primary text-background"
                )}
                onmouseenter={() => (active = segment.token)}
                onfocus={() => (active = segment.token)}>{segment.text}</mark>{:else}<span class={cn("rounded-xs bg-foreground/8", segment.in_source && "ring-2 ring-primary ring-inset")}>{segment.text}</span>{/if}{/each}</div>
        <p class="min-h-10 text-ui text-foreground/80" aria-live="polite">
          {#if active_match}
            {describe(active_match)}
          {:else}
            Point at a highlighted run, or tab to it, to see where it was copied from.
          {/if}
        </p>
      </div>

      <p class="text-2xs text-foreground/65">
        A real encoder searches a 32 KB window and sometimes waits one character for a longer match, so the browser's Deflate may pick slightly different
        repeats. Short or random text barely shrinks: there's nothing to repeat, and the format has a few bytes of overhead.
      </p>

      <Separator />

      <ArchiveHowHuffman {tokens} bytes={bytes.length} />
    </div>
  </div>
</div>

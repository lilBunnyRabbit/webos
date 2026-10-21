<script lang="ts">
  import kernel, { type ClipboardService } from "$lib/core/api";
  import { Button, CopyButton, EmptyState } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Bug as BugIcon, Check as CheckIcon, TreeStructure as TreeStructureIcon } from "phosphor-svelte";
  import type { Span } from "./ast";
  import type { Compiled } from "./compile";
  import { report_error } from "$kit/utils/report-error";

  interface Props {
    entries: Compiled[];
    kind: "setters" | "parts";
    xml: string;
    onreveal: (span: Span) => void;
  }

  let { entries, kind, xml, onreveal }: Props = $props();

  const { app_id } = get_app_context();
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));

  const all = $derived(kind === "setters" ? xml : entries.map((entry) => `${entry.name}: ${entry.ft}`).join("\n"));

  let copied_debug = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));

  async function copy_debug(entry: Compiled) {
    try {
      await clipboard.copy_text(entry.debug);
    } catch (reason) {
      report_error(app_id, "Couldn't copy to the clipboard", reason);
      return;
    }
    copied_debug = entry.name;
    clearTimeout(timer);
    timer = setTimeout(() => (copied_debug = null), 1200);
  }
</script>

<div class="flex flex-col gap-3 p-3">
  {#if kind === "setters"}
    <p class="text-2xs text-foreground/65">
      In the designer's variables panel, add one setter per row in this order: the name as the variable, the code as its expression. Or paste the block
      over <code class="font-mono">&lt;Variables /&gt;</code> in the craft's XML; it follows the format of a real SimplePlanes save.
    </p>
  {:else}
    <p class="text-2xs text-foreground/65">Paste each into the input field of its part. Parts run after every setter.</p>
  {/if}
  <p class="text-2xs text-foreground/65">Debug copies a <code class="font-mono">DebugExpression</code> for the game's dev console, which shows the value live.</p>

  {#if entries.length}
    <div class="flex items-center gap-2">
      <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{entries.length} {kind === "setters" ? "setters" : "part inputs"}</span>
      <CopyButton class="ml-auto" text={all} label={kind === "setters" ? "Copy the Variables block" : "Copy every part input"} />
    </div>
    <ol class="flex flex-col gap-2">
      {#each entries as entry, index (entry.name)}
        <li class="flex flex-col gap-1 rounded-lg bg-background-light p-2.5">
          <div class="flex items-center gap-1">
            {#if kind === "setters"}<span class="w-5 shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</span>{/if}
            <button
              type="button"
              class="min-w-0 truncate rounded-sm font-mono text-ui font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none"
              title="Show in the code"
              onclick={() => onreveal(entry.span)}
            >
              {entry.name}
            </button>
            <span class="ml-auto flex shrink-0 items-center gap-0.5">
              <Button size="sm" variant="quiet" aria-label="Copy DebugExpression for {entry.name}" onclick={() => copy_debug(entry)}>
                {#if copied_debug === entry.name}<CheckIcon weight="bold" />{:else}<BugIcon weight="bold" />{/if}
                Debug
              </Button>
              <CopyButton text={entry.ft} label="Copy {entry.name}" />
            </span>
          </div>
          <code class="font-mono text-2xs break-all text-foreground/80 select-text">{entry.ft}</code>
        </li>
      {/each}
    </ol>
  {:else}
    <EmptyState
      icon={TreeStructureIcon}
      title={kind === "setters" ? "No setters" : "No part inputs"}
      description={kind === "setters" ? "Each var becomes a setter, like var level = clamp01(Roll == 0)." : "Each output is a part's input, like output aileron = Roll."}
    />
  {/if}
</div>

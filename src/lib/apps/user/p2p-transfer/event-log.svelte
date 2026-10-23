<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { CaretRight as CaretRightIcon } from "phosphor-svelte";
  import type { LogLine } from "./session.svelte";

  let { lines }: { lines: LogLine[] } = $props();

  let list: HTMLOListElement | null = $state(null);

  $effect(() => {
    if (lines.length && list) list.scrollTop = list.scrollHeight;
  });

  function stamp(ms: number): string {
    return `+${(ms / 1000).toFixed(3).padStart(7, "0")}`;
  }
</script>

<details class="group overflow-hidden rounded-xl bg-background-light shadow-card ring-1 ring-hairline" open>
  <summary class="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 font-mono text-2xs font-medium tracking-wide text-foreground/80 uppercase select-none">
    <CaretRightIcon weight="bold" class="size-3 transition-transform duration-150 group-open:rotate-90" />
    Event log
    <span class="ml-auto tabular-nums">{lines.length}</span>
  </summary>
  <ol bind:this={list} class="max-h-40 overflow-auto border-t border-hairline bg-field px-3 py-2 font-mono text-2xs leading-relaxed">
    {#each lines as line (line.id)}
      <li class="flex gap-3">
        <span class="shrink-0 text-foreground/80 tabular-nums">{stamp(line.at)}</span>
        <span class={cn("min-w-0 break-words", line.tone === "ok" && "text-success", line.tone === "error" && "text-error")}>{line.text}</span>
      </li>
    {:else}
      <li class="text-foreground/80">Nothing yet.</li>
    {/each}
  </ol>
</details>

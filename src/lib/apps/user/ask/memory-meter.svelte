<script lang="ts">
  import { CaretDown as CaretDownIcon } from "phosphor-svelte";
  import { breakdown, percent, questions_left } from "./assistant";
  import type { AiUsage } from "$lib/core/api";

  interface Props {
    usage: AiUsage;
    instructions: number;
    questions: number;
    onnew: () => void;
  }

  let { usage, instructions, questions, onnew }: Props = $props();

  let open = $state(false);
  const parts = $derived(breakdown(usage, instructions));
  const full = $derived(percent(parts.instructions + parts.conversation, parts.window));
  const left = $derived(questions_left(parts, questions));
  const tone = $derived(full >= 90 ? "bg-error" : full >= 75 ? "bg-warning" : "bg-primary");
  const rows = $derived([
    { label: "Instructions", detail: "How Ask is told to answer", tokens: parts.instructions, swatch: "bg-foreground/45" },
    { label: "This conversation", detail: "Your questions, the answers and what Ask read", tokens: parts.conversation, swatch: tone },
    { label: "Free", detail: "Room for what comes next", tokens: parts.free, swatch: "bg-foreground/10" },
  ]);
</script>

<div class="border-b border-foreground/8 bg-background-light text-2xs text-foreground/75">
  <button
    type="button"
    class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-foreground/4 pointer-coarse:py-2.5"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span class="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-foreground/10" role="meter" aria-label="Chat memory" aria-valuenow={full} aria-valuemin={0} aria-valuemax={100}>
      <span class={["block h-full rounded-full transition-[width]", tone]} style:width="{full}%"></span>
    </span>
    <span class="shrink-0 tabular-nums">
      Chat memory {full} %{#if left !== null} · about {left} more {left === 1 ? "question" : "questions"}{/if}
    </span>
    <CaretDownIcon weight="bold" class={["size-3 shrink-0 transition-transform", open && "rotate-180"]} />
  </button>
  {#if full >= 90}
    <div class="flex items-center gap-2 px-3 pb-1.5 text-foreground/85">
      <span class="min-w-0 flex-1">Memory is nearly full: the oldest messages will be forgotten soon.</span>
      <button type="button" class="shrink-0 font-medium text-primary underline underline-offset-2" onclick={onnew}>New chat</button>
    </div>
  {/if}
  {#if open}
    <div class="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2 gap-y-1 px-3 pb-2">
      {#each rows as row (row.label)}
        <span class={["size-2 self-center rounded-full", row.swatch]} aria-hidden="true"></span>
        <span class="min-w-0"><span class="font-medium text-foreground">{row.label}</span> <span class="text-foreground/65">· {row.detail}</span></span>
        <span class="text-right tabular-nums" title="{row.tokens.toLocaleString('en')} tokens">{percent(row.tokens, parts.window)} %</span>
      {/each}
      <span></span>
      <span class="text-foreground/65">The AI holds about {parts.window.toLocaleString("en")} tokens (roughly {Math.round(parts.window * 0.75).toLocaleString("en")} words) at once.</span>
      <span></span>
    </div>
  {/if}
</div>

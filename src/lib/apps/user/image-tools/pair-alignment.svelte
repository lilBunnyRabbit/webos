<script lang="ts">
  import { IconButton, Input, Spinner } from "$lib/core/components/ui";
  import { ArrowsClockwise as ArrowsClockwiseIcon } from "phosphor-svelte";
  import type { ImagePair } from "./pair.svelte";

  interface Props {
    pair: ImagePair;
    rough: string;
  }

  const { pair, rough }: Props = $props();
  const match_label = $derived(pair.match >= 0.9 ? "Good match" : pair.match >= 0.6 ? rough : "No clear match, nudge it by hand");

  function signed(value: number): string {
    return value < 0 ? `−${Math.abs(value)}` : `${value}`;
  }
</script>

<div class="flex items-center justify-between">
  <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Alignment</h3>
  <IconButton label="Align again" size="sm" disabled={pair.aligning} onclick={() => pair.realign()}><ArrowsClockwiseIcon weight="bold" /></IconButton>
</div>
{#if pair.aligning || !pair.alignment}
  <div class="flex items-center gap-2 px-0.5 text-ui text-foreground/80"><Spinner label="Aligning" /> Aligning…</div>
{:else}
  <p class="px-0.5 text-ui">
    Scale {pair.alignment.scale}, offset {signed(pair.alignment.dx)}, {signed(pair.alignment.dy)}
    <span class={["block text-2xs", pair.match >= 0.9 ? "text-foreground/65" : "text-warning"]}>{match_label}</span>
  </p>
  <div class="grid grid-cols-3 gap-1.5">
    <label class="flex flex-col gap-1 text-2xs text-foreground/65">
      Scale
      <Input type="number" size="sm" step={0.001} min={0.001} value={pair.alignment.scale} oninput={(event) => pair.nudge("scale", event.currentTarget.value)} class="w-full font-mono tabular-nums" />
    </label>
    <label class="flex flex-col gap-1 text-2xs text-foreground/65">
      X
      <Input type="number" size="sm" step={0.5} value={pair.alignment.dx} oninput={(event) => pair.nudge("dx", event.currentTarget.value)} class="w-full font-mono tabular-nums" />
    </label>
    <label class="flex flex-col gap-1 text-2xs text-foreground/65">
      Y
      <Input type="number" size="sm" step={0.5} value={pair.alignment.dy} oninput={(event) => pair.nudge("dy", event.currentTarget.value)} class="w-full font-mono tabular-nums" />
    </label>
  </div>
{/if}

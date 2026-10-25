<script lang="ts">
  import { Button, IconButton } from "$lib/core/components/ui";
  import { format_time } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import { Check as CheckIcon, Repeat as RepeatIcon, X as XIcon } from "phosphor-svelte";
  import { brew_remaining, next_steep, strength_label, type Brew } from "./tea";

  let {
    brew,
    now,
    fresh,
    onsteep,
    onstop,
  }: { brew: Brew; now: number; fresh: boolean; onsteep: (steep: number) => void; onstop: () => void } = $props();

  function reveal(node: HTMLElement) {
    if (fresh) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const remaining = $derived(brew_remaining(brew, now));
  const progress = $derived(brew.ready ? 1 : Math.min(1, 1 - remaining / brew.duration_ms));
  const next = $derived(next_steep(brew));
  const steeps = $derived(brew.tea && brew.tea.steeps > 1 ? `Steep ${brew.steep} of ${brew.tea.steeps}` : "");
</script>

<li {@attach reveal} class="flex items-center gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8">
  <div class="relative size-14 shrink-0" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Brewed">
    <svg viewBox="0 0 36 36" class="size-full -rotate-90" aria-hidden="true">
      <circle cx="18" cy="18" r="15.5" fill="none" stroke-width="3" class="stroke-foreground/10" />
      <circle
        cx="18"
        cy="18"
        r="15.5"
        fill="none"
        stroke-width="3"
        stroke-linecap="round"
        pathLength="100"
        stroke-dasharray="100"
        stroke-dashoffset={100 - progress * 100}
        class={cn("transition-[stroke-dashoffset] duration-300 ease-linear", brew.ready ? "stroke-success" : "stroke-primary")}
      />
    </svg>
    {#if brew.ready}<CheckIcon weight="bold" class="absolute inset-0 m-auto size-5 text-success" />{/if}
  </div>
  <div class="min-w-0 flex-1">
    <p class="truncate font-medium">{brew.name}</p>
    <p class="truncate text-2xs text-foreground/65">{[steeps, strength_label(brew.strength)].filter(Boolean).join(" · ")}</p>
    {#if brew.ready}
      <p class="text-ui font-medium text-success">Ready</p>
    {:else}
      <p class="font-mono text-2xl leading-tight font-medium tabular-nums">{format_time(Math.ceil(remaining / 1000) * 1000)}</p>
    {/if}
  </div>
  {#if brew.ready}
    <div class="flex shrink-0 flex-col items-stretch gap-1.5 @sm:flex-row @sm:items-center">
      {#if next !== null}
        {@const steep = next}
        <Button size="sm" variant="primary" onclick={() => onsteep(steep)}><RepeatIcon weight="bold" />Steep {steep}</Button>
      {/if}
      <Button size="sm" variant={next === null ? "secondary" : "quiet"} onclick={onstop}>Done</Button>
    </div>
  {:else}
    <IconButton label="Stop brewing {brew.name}" size="sm" onclick={onstop}><XIcon weight="bold" /></IconButton>
  {/if}
</li>

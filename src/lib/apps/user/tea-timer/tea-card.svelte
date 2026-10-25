<script lang="ts">
  import { Badge, Button, IconButton, Segmented } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { DotsThree as DotsThreeIcon, Play as PlayIcon } from "phosphor-svelte";
  import { format_range, format_seconds, format_temp, format_steeps, strength_seconds, STRENGTHS, temp_in, TempUnit, type Strength, type TeaEntry } from "./tea";

  let {
    tea,
    unit,
    strength,
    onstrength,
    onbrew,
    onmenu,
  }: {
    tea: TeaEntry;
    unit: TempUnit;
    strength: Strength;
    onstrength: (strength: Strength) => void;
    onbrew: () => void;
    onmenu: (anchor: { x: number; y: number }) => void;
  } = $props();

  const steeps = $derived(format_steeps(tea));
</script>

<li class={cn("grid gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8", tea.hidden && "opacity-60")}>
  <div class="flex items-start gap-3">
    <div class="grid size-12 shrink-0 place-content-center rounded-lg bg-primary/12 text-center text-primary" aria-hidden="true">
      <span class="font-mono text-base leading-none font-medium tabular-nums">{temp_in(tea.temp_c, unit)}°</span>
      <span class="mt-0.5 font-mono text-2xs leading-none opacity-80">{unit === TempUnit.F ? "F" : "C"}</span>
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-1.5">
        <h3 class="truncate font-medium">{tea.name}<span class="sr-only">, {format_temp(tea.temp_c, unit)}</span></h3>
        {#if tea.edited}<Badge>Edited</Badge>{/if}
        {#if tea.hidden}<Badge>Hidden</Badge>{/if}
      </div>
      <p class="font-mono text-2xs text-foreground/65 tabular-nums">{format_range(tea)}{steeps ? ` · ${steeps}` : ""}</p>
      {#if tea.notes}<p class="mt-1 line-clamp-2 text-ui text-pretty text-foreground/80">{tea.notes}</p>{/if}
    </div>
    <IconButton label="More for {tea.name}" size="sm" onclick={(event) => onmenu({ x: event.clientX, y: event.clientY })}><DotsThreeIcon weight="bold" /></IconButton>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <Segmented bind:value={() => strength, (next) => onstrength(next)} options={STRENGTHS} label="Strength for {tea.name}" size="sm" />
    <span class="ml-auto font-mono text-ui text-foreground/80 tabular-nums">{format_seconds(strength_seconds(tea, strength))}</span>
    <Button size="sm" onclick={onbrew}><PlayIcon weight="bold" />Brew</Button>
  </div>
</li>

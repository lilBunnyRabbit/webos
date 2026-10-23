<script lang="ts">
  import type { ThemePreset } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { Check as CheckIcon } from "phosphor-svelte";

  let { preset, active, onselect }: { preset: ThemePreset; active: boolean; onselect: () => void } = $props();

  const theme = $derived(preset.theme);
</script>

<!-- A miniature of the OS in the preset's own colours: desktop, a window with chrome, text lines and a button.
     Derived tokens are written against var(--background) etc., so the miniature re-declares the preset's base colours
     to make them resolve to this preset; the card around it keeps the active theme. -->
<button
  aria-pressed={active}
  class={cn(
    "group flex flex-col gap-2 rounded-xl p-1.5 text-left transition-colors duration-150",
    active ? "bg-background-lighter shadow-control" : "hover:text-foreground"
  )}
  onclick={onselect}
>
  <span
    class={cn("relative block aspect-[16/10] w-full overflow-hidden rounded-lg ring-1 transition-shadow", active ? "ring-2 ring-primary" : "ring-hairline")}
    style:--background={theme.background}
    style:--foreground={theme.foreground}
    style:--primary={theme.primary}
    style:--secondary={theme.secondary}
    style:--accent={theme.accent}
    style:--background-darkest={theme.background_darkest}
    style:background={theme.background_darkest}
  >
    <span class="absolute inset-x-[14%] top-[16%] bottom-[22%] overflow-hidden rounded-[5px] shadow-raised" style:background={theme.background}>
      <span class="flex h-[22%] items-center gap-[3px] px-[6%]" style:background={theme.background_light}>
        <span class="size-[5px] rounded-full" style:background={theme.foreground} style:opacity="0.5"></span>
        <span class="h-[3px] w-1/3 rounded-full" style:background={theme.foreground} style:opacity="0.5"></span>
      </span>
      <span class="flex flex-col gap-[4px] p-[8%]">
        <span class="h-[3px] w-3/4 rounded-full" style:background={theme.foreground}></span>
        <span class="h-[3px] w-1/2 rounded-full" style:background={theme.foreground} style:opacity="0.6"></span>
        <span class="mt-[3px] flex gap-[4px]">
          <span class="h-[7px] w-[30%] rounded-[2px]" style:background={theme.primary}></span>
          <span class="h-[7px] w-[16%] rounded-[2px]" style:background={theme.secondary}></span>
        </span>
      </span>
    </span>
    <span class="absolute inset-x-[30%] bottom-[6%] h-[9%] rounded-[3px]" style:background={theme.background_light}></span>
  </span>
  <span class="flex items-center justify-between gap-2 px-1 pb-0.5">
    <span class="truncate text-ui font-medium">{preset.name}</span>
    {#if active}<CheckIcon class="size-3.5 shrink-0 text-primary" weight="bold" />{/if}
  </span>
</button>

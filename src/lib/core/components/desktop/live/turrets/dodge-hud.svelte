<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { cn } from "$lib/core/utils/utils";
  import { format_dodge } from "./dodge";
  import type { DodgeGame } from "./dodge.svelte";

  let { game }: { game: DodgeGame } = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));
  // Toasts gather by the tray; with the taskbar on top they come in at the top right, so the HUD moves down.
  const bottom = $derived(settings.taskbar.position === "top");
</script>

<div
  data-dodge-hud
  class={cn(
    "absolute right-3 flex items-baseline gap-3 rounded-lg bg-background/70 px-2.5 py-1 font-mono text-2xs text-foreground/80 tabular-nums shadow-popover backdrop-blur-sm",
    bottom ? "bottom-3" : "top-3"
  )}
>
  <span><span class="text-foreground/65">Time</span> <span class="text-foreground">{format_dodge(game.current)}</span></span>
  <span><span class="text-foreground/65">Best</span> <span class="text-primary">{format_dodge(game.best)}</span></span>
</div>

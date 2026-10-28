<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { GEAR_NAMES, GEARS } from "./keys";
  import { Gear } from "./vehicle";

  interface Props {
    gear: Gear;
    onshift: (gear: Gear) => void;
    /** Off where a game takes Space for something else. */
    space_parks?: boolean;
  }

  let { gear: current, onshift, space_parks = true }: Props = $props();
</script>

<div class="pointer-events-auto flex items-center gap-0.5 rounded-md bg-background/85 p-0.5 font-mono text-ui backdrop-blur-[2px]" role="group" aria-label="Gear">
  {#each GEARS as gear (gear)}
    <!-- Pressing keeps the focus on the board, so the arrow keys still drive after a click. -->
    <button
      type="button"
      class={cn(
        "grid h-6 w-6 place-items-center rounded-sm transition-colors pointer-coarse:size-11 pointer-coarse:text-base",
        current === gear ? "bg-primary font-semibold text-background" : "text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
      )}
      aria-label={GEAR_NAMES[gear]}
      title="{GEAR_NAMES[gear]} ({gear === Gear.DRIVE ? 'E' : gear === Gear.PARK ? (space_parks ? 'P or Space' : 'P') : gear})"
      aria-pressed={current === gear}
      onmousedown={(event) => event.preventDefault()}
      onclick={() => onshift(gear)}
    >
      {gear}
    </button>
  {/each}
</div>

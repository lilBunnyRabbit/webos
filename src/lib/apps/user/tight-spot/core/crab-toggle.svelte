<script lang="ts">
  import { cn } from "$lib/core/utils";

  interface Props {
    on: boolean;
    onclick: () => void;
  }

  let { on, onclick }: Props = $props();
</script>

<button
  type="button"
  class={cn(
    "pointer-events-auto h-7 rounded-md px-2 font-mono text-ui backdrop-blur-[2px] transition-colors pointer-coarse:h-11 pointer-coarse:px-3 pointer-coarse:text-base",
    on ? "bg-primary font-semibold text-background" : "bg-background/85 text-foreground/70 hover:text-foreground"
  )}
  aria-pressed={on}
  title="Crab steer (V), switches when stopped"
  onmousedown={(event) => event.preventDefault()}
  {onclick}
>
  Crab
</button>

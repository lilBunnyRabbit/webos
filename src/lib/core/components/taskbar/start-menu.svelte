<script lang="ts">
  import { LayoutGrid } from "@lucide/svelte";
  import StartMenuPopover from "./start-menu-popover.svelte";
  // TODO: design, pin, etc

  let open = $state(false);
</script>

<button
  popovertarget="start-menu-popover"
  popovertargetaction="toggle"
  class="group relative flex justify-center items-center rounded-sm transition-all duration-150 min-w-0 shrink-0 w-10 h-10 hover:bg-foreground/10 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-6 data-[state=open]:bg-primary/10"
>
  <LayoutGrid class="text-primary" />
</button>

<div id="start-menu-popover" popover ontoggle={(event) => (open = event.newState === "open")}>
  {#if open}
    <StartMenuPopover />
  {/if}
</div>

<style>
  #start-menu-popover {
    margin: auto;

    &:popover-open {
      width: fit-content;
      height: 200px;
      padding: 0 10px;
      border-radius: 10px;
      overflow-y: auto;
    }

    &::backdrop {
      background: color-mix(in oklch, var(--background) 80%, transparent);
      backdrop-filter: blur(3px);
    }
  }
</style>

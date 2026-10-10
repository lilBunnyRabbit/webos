<script lang="ts">
  import LogoMark from "../brand/logo-mark.svelte";
  import StartMenuPopover from "./start-menu-popover.svelte";
  // TODO: design, pin, etc

  let open = $state(false);
</script>

<button
  title="Start"
  popovertarget="start-menu-popover"
  popovertargetaction="toggle"
  class="group relative flex justify-center items-center rounded-sm transition-all duration-150 min-w-0 shrink-0 w-10 h-10 hover:bg-foreground/10 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-6 data-[state=open]:bg-primary/10"
>
  <LogoMark class="text-primary" title="Start" />
</button>

<div
  id="start-menu-popover"
  class="bg-background text-foreground border border-foreground/20"
  popover
  ontoggle={(event) => (open = event.newState === "open")}>
  {#if open}
    <StartMenuPopover />
  {/if}
</div>

<style>
  #start-menu-popover {
    margin: auto;

    &:popover-open {
      width: 100%;
      max-width: min(calc(100% - 4rem), 40rem);
      height: min(calc(100% - 4rem), 40rem);
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

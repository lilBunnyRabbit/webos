<script lang="ts">
  import { IconButton, Segmented, Switch } from "$lib/core/components/ui";
  import { SlidersHorizontal as SlidersIcon } from "phosphor-svelte";
  import { ONSCREEN_OPTIONS, type OnScreen } from "$kit/games/play2d/onscreen";

  interface Props {
    sound: boolean;
    onscreen: OnScreen;
    air: boolean;
    wind: boolean;
    infinite_fuel: boolean;
    onsound: (on: boolean) => void;
    ononscreen: (mode: OnScreen) => void;
    onair: (on: boolean) => void;
    onwind: (on: boolean) => void;
    oninfinite: (on: boolean) => void;
    onfocus: () => void;
    panel?: HTMLDivElement;
  }

  let { sound, onscreen, air, wind, infinite_fuel, onsound, ononscreen, onair, onwind, oninfinite, onfocus, panel = $bindable() }: Props = $props();

  const uid = $props.id();

  // A closed panel hands the keys back to the board, unless the click that closed it went to another control.
  function on_toggle(event: ToggleEvent) {
    if (event.newState !== "closed") return;
    const active = document.activeElement;
    if (!active || active === document.body || panel?.contains(active) || active.getAttribute("popovertarget") === panel?.id) onfocus();
  }
</script>

<IconButton size="sm" label="Settings" popovertarget="ll-settings-{uid}" style="anchor-name: --ll-settings-{uid}">
  <SlidersIcon weight="bold" />
</IconButton>

<div
  bind:this={panel}
  id="ll-settings-{uid}"
  popover="auto"
  class="ll-popover m-0 w-68 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
  style="position-anchor: --ll-settings-{uid}"
  ontoggle={on_toggle}
>
  <div class="flex flex-col gap-3">
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex flex-col">Sound <span class="text-2xs text-foreground/65">The engine, the thrusters and the legs</span></span>
      <Switch bind:checked={() => sound, onsound} />
    </label>
    <div class="flex flex-col gap-1.5">
      <span class="flex flex-col text-ui">On-screen controls <span class="text-2xs text-foreground/65">The lever, Burn and the turn buttons. Auto shows them on a touch screen</span></span>
      <Segmented size="sm" class="flex w-full [&>label]:flex-1 [&>label]:justify-center" label="On-screen controls" options={ONSCREEN_OPTIONS} bind:value={() => onscreen, ononscreen} />
    </div>
    <p class="text-2xs font-medium text-foreground/65 uppercase">Free flight at the base</p>
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex flex-col">Air <span class="text-2xs text-foreground/65">The body's own air: thin on Mars, thick on Earth, none on the Moon</span></span>
      <Switch bind:checked={() => air, onair} />
    </label>
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex flex-col">Wind <span class="text-2xs text-foreground/65">Gusts that push the ship; they need air</span></span>
      <Switch bind:checked={() => wind, onwind} />
    </label>
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex flex-col">Infinite fuel <span class="text-2xs text-foreground/65">The tank never runs dry</span></span>
      <Switch bind:checked={() => infinite_fuel, oninfinite} />
    </label>
  </div>
</div>

<style>
  .ll-popover {
    position-area: bottom span-left;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }
</style>

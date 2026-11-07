<script lang="ts">
  import { IconButton, Segmented, Switch } from "$lib/core/components/ui";
  import { SlidersHorizontal as SlidersIcon } from "phosphor-svelte";
  import { PitchMode } from "./core/controls.svelte";

  interface Props {
    sound: boolean;
    pitch: PitchMode;
    onsound: (on: boolean) => void;
    onpitch: (mode: PitchMode) => void;
    onfocus: () => void;
    panel?: HTMLDivElement;
  }

  let { sound, pitch, onsound, onpitch, onfocus, panel = $bindable() }: Props = $props();

  const uid = $props.id();
  const PITCH_OPTIONS = [
    { value: PitchMode.GAME, label: "Up is up" },
    { value: PitchMode.PILOT, label: "Pilot" },
  ];

  // A closed panel hands the keys back to the board, unless the click that closed it went to another control.
  function on_toggle(event: ToggleEvent) {
    if (event.newState !== "closed") return;
    const active = document.activeElement;
    if (!active || active === document.body || panel?.contains(active) || active.getAttribute("popovertarget") === panel?.id) onfocus();
  }
</script>

<IconButton size="sm" label="Settings" popovertarget="af-settings-{uid}" style="anchor-name: --af-settings-{uid}">
  <SlidersIcon weight="bold" />
</IconButton>

<div
  bind:this={panel}
  id="af-settings-{uid}"
  popover="auto"
  class="af-popover m-0 w-68 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
  style="position-anchor: --af-settings-{uid}"
  ontoggle={on_toggle}
>
  <div class="flex flex-col gap-3">
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex flex-col">Sound <span class="text-2xs text-foreground/65">Engine, wind, the stall horn and the tyres</span></span>
      <Switch bind:checked={() => sound, onsound} />
    </label>
    <div class="flex flex-col gap-1.5">
      <span class="flex flex-col text-ui">Pitch <span class="text-2xs text-foreground/65">Up is up: W, ↑ or dragging up raise the nose. Pilot: they push the stick forward, as in a cockpit</span></span>
      <Segmented size="sm" class="flex w-full [&>label]:flex-1 [&>label]:justify-center" label="Pitch" options={PITCH_OPTIONS} bind:value={() => pitch, onpitch} />
    </div>
  </div>
</div>

<style>
  .af-popover {
    position-area: bottom span-left;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }
</style>

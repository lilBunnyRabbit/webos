<script lang="ts">
  import { IconButton, Segmented, Switch } from "$lib/core/components/ui";
  import { SlidersHorizontal as SlidersIcon } from "phosphor-svelte";
  import { ThrottleMode } from "./core/lever";

  interface Props {
    sound: boolean;
    throttle: ThrottleMode;
    onsound: (on: boolean) => void;
    onthrottle: (mode: ThrottleMode) => void;
    onfocus: () => void;
    panel?: HTMLDivElement;
  }

  let { sound, throttle, onsound, onthrottle, onfocus, panel = $bindable() }: Props = $props();

  const uid = $props.id();
  const THROTTLE_OPTIONS = [
    { value: ThrottleMode.LEVER, label: "Lever" },
    { value: ThrottleMode.HOLD, label: "Hold" },
  ];

  // A closed panel hands the keys back to the board, unless the click that closed it went to another control.
  function on_toggle(event: ToggleEvent) {
    if (event.newState !== "closed") return;
    const active = document.activeElement;
    if (!active || active === document.body || panel?.contains(active) || active.getAttribute("popovertarget") === panel?.id) onfocus();
  }
</script>

<IconButton size="sm" label="Settings" popovertarget="hb-settings-{uid}" style="anchor-name: --hb-settings-{uid}">
  <SlidersIcon weight="bold" />
</IconButton>

<div
  bind:this={panel}
  id="hb-settings-{uid}"
  popover="auto"
  class="hb-popover m-0 w-68 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
  style="position-anchor: --hb-settings-{uid}"
  ontoggle={on_toggle}
>
  <div class="flex flex-col gap-3">
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex flex-col">Sound <span class="text-2xs text-foreground/65">Engine, fenders and the lines going on</span></span>
      <Switch bind:checked={() => sound, onsound} />
    </label>
    <div class="flex flex-col gap-1.5">
      <span class="flex flex-col text-ui">Throttle <span class="text-2xs text-foreground/65">Lever stays where you leave it; Hold gives half ahead or astern while held</span></span>
      <Segmented size="sm" class="flex w-full [&>label]:flex-1 [&>label]:justify-center" label="Throttle" options={THROTTLE_OPTIONS} bind:value={() => throttle, onthrottle} />
    </div>
  </div>
</div>

<style>
  .hb-popover {
    position-area: bottom span-left;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }
</style>

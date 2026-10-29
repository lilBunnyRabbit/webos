<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { IconButton, Segmented, Switch } from "$lib/core/components/ui";
  import { SlidersHorizontal as SlidersIcon } from "phosphor-svelte";
  import type { DriveInput } from "./drive-input.svelte";
  import { SteeringMode, WheelMode, type DriveSettings, type Toggle } from "./settings.svelte";

  interface Props {
    settings: DriveSettings;
    input: DriveInput;
    onmute: () => void;
    onfocus: () => void;
    panel?: HTMLDivElement;
  }

  let { settings, input, onmute, onfocus, panel = $bindable() }: Props = $props();

  const uid = $props.id();
  const WHEEL_OPTIONS = [
    { value: WheelMode.CENTRES, label: "Centres" },
    { value: WheelMode.STAYS, label: "Stays" },
  ];
  const STEERING_OPTIONS = [
    { value: SteeringMode.WHEEL, label: "Wheel" },
    { value: SteeringMode.BUTTONS, label: "Buttons" },
  ];

  function toggle(name: Toggle, value: boolean) {
    settings.toggle(name, value);
    if (!value && name === "sound") onmute();
  }

  function set_steering(value: SteeringMode) {
    settings.set_steering(value);
    input.drop_steer_buttons();
  }

  // A closed settings panel hands the keys back to the board, unless the click that closed it went to another control.
  function on_toggle(event: ToggleEvent) {
    if (event.newState !== "closed") return;
    const active = document.activeElement;
    if (!active || active === document.body || panel?.contains(active) || active.getAttribute("popovertarget") === panel?.id) onfocus();
  }
</script>

<IconButton size="sm" label="Settings" popovertarget="ts-settings-{uid}" style="anchor-name: --ts-settings-{uid}">
  <SlidersIcon weight="bold" />
</IconButton>

<div
  bind:this={panel}
  id="ts-settings-{uid}"
  popover="auto"
  class="ts-popover m-0 w-68 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
  style="position-anchor: --ts-settings-{uid}"
  ontoggle={on_toggle}
>
  <div class="flex flex-col gap-3">
    <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Feedback</p>
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex flex-col">Sound <span class="text-2xs text-foreground/65">Sensor beeps, gear clicks and results</span></span>
      <Switch bind:checked={() => settings.sound, (value: boolean) => toggle("sound", value)} />
    </label>
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex flex-col">Rumble <span class="text-2xs text-foreground/65">A controller buzzes on a bump and close to things</span></span>
      <Switch bind:checked={() => settings.rumble, (value: boolean) => toggle("rumble", value)} />
    </label>
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex flex-col">Guide lines <span class="text-2xs text-foreground/65">Where the front corners will go</span></span>
      <Switch bind:checked={() => settings.guides, (value: boolean) => toggle("guides", value)} />
    </label>
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex flex-col">Zoom with speed <span class="text-2xs text-foreground/65">The view pulls back as you go faster</span></span>
      <Switch bind:checked={() => settings.speed_zoom, (value: boolean) => toggle("speed_zoom", value)} />
    </label>
    <p class="mt-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Driving</p>
    <label class="flex items-center justify-between gap-3 text-ui">
      <span class="flex flex-col">Creep <span class="text-2xs text-foreground/65">D and R roll without gas, like an automatic</span></span>
      <Switch bind:checked={() => settings.creep, (value: boolean) => toggle("creep", value)} />
    </label>
    <div class="hidden flex-col gap-1.5 pointer-coarse:flex">
      <span class="flex flex-col text-ui">Steering <span class="text-2xs text-foreground/65">Drag a wheel, or hold ◀ ▶ buttons</span></span>
      <Segmented size="sm" class="flex w-full [&>label]:flex-1 [&>label]:justify-center" label="Steering" options={STEERING_OPTIONS} bind:value={() => settings.steering, set_steering} />
    </div>
    <div class={cn("flex flex-col gap-1.5", settings.steering !== SteeringMode.BUTTONS && "pointer-coarse:hidden")}>
      <span class="flex flex-col text-ui pointer-coarse:hidden">Keyboard wheel <span class="text-2xs text-foreground/65">When you let go of ← →</span></span>
      <span class="hidden flex-col text-ui pointer-coarse:flex">Steering buttons <span class="text-2xs text-foreground/65">When you let go of ◀ ▶</span></span>
      <Segmented size="sm" class="flex w-full [&>label]:flex-1 [&>label]:justify-center" label="Wheel when let go" options={WHEEL_OPTIONS} bind:value={() => settings.wheel, (value: WheelMode) => settings.set_wheel(value)} />
    </div>
  </div>
</div>

<style>
  .ts-popover {
    position-area: bottom span-left;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }
</style>

<script lang="ts">
  import { Button, Segmented, SettingRow, Slider, Switch } from "$lib/core/components/ui";
  import type { LiveSettingsProps } from "../registry";
  import { TurretsMode, TurretsPace, type TurretsOptions } from "./options";
  import { damage_store } from "./damage";

  let { value, onchange }: LiveSettingsProps<TurretsOptions> = $props();

  const MODES = [
    { value: TurretsMode.SHIELD, label: "Shield" },
    { value: TurretsMode.FOLLOW, label: "Follow" },
    { value: TurretsMode.DODGE, label: "Dodge" },
  ];

  const PACES = [
    { value: TurretsPace.CHILL, label: "Chill" },
    { value: TurretsPace.NORMAL, label: "Normal" },
    { value: TurretsPace.FRANTIC, label: "Frantic" },
  ];

  const MODE_DESCRIPTIONS: Record<TurretsMode, string> = {
    [TurretsMode.SHIELD]: "Windows are walls: bolts stop at their edges.",
    [TurretsMode.FOLLOW]: "Bolts fly over windows and reach the cursor anywhere.",
    [TurretsMode.DODGE]: "A game: bolts fly over windows and a clock in the corner counts how long you last. A hit starts it again; your best is kept.",
  };

  function update(change: Partial<TurretsOptions>) {
    onchange({ ...value, ...change });
  }
</script>

<div class="flex flex-col gap-1">
  <SettingRow label="Mode" description={MODE_DESCRIPTIONS[value.mode]}>
    {#snippet children({ id, describedby })}
      <Segmented {id} aria-describedby={describedby} label="Mode" size="sm" options={MODES} bind:value={() => value.mode, (mode) => update({ mode })} />
    {/snippet}
  </SettingRow>
  <SettingRow label="Pace" description="How often the turrets fire, and how fast.">
    {#snippet children({ id, describedby })}
      <Segmented {id} aria-describedby={describedby} label="Pace" size="sm" options={PACES} bind:value={() => value.pace, (pace) => update({ pace })} />
    {/snippet}
  </SettingRow>
  <SettingRow label="Sound" description="A pew per shot and a pop on a hit.">
    {#snippet children({ id, describedby })}
      <Switch {id} aria-describedby={describedby} bind:checked={() => value.sound, (sound) => update({ sound })} />
    {/snippet}
  </SettingRow>
  <SettingRow label="Volume">
    {#snippet children({ id, describedby })}
      <Slider
        {id}
        aria-describedby={describedby}
        class="w-40"
        min={0}
        max={100}
        disabled={!value.sound}
        bind:value={() => Math.round(value.volume * 100), (volume) => update({ volume: (volume ?? 0) / 100 })}
      />
    {/snippet}
  </SettingRow>
  <SettingRow
    label="Damage"
    description={value.mode === TurretsMode.SHIELD ? "Lasers chip windows and widgets. Only for looks, gone on reload." : "Shield mode only: in Follow and Dodge bolts hit nothing."}
  >
    {#snippet children({ id, describedby })}
      <Button size="sm" variant="quiet" onclick={() => damage_store.clear()}>Repair everything</Button>
      <Switch {id} aria-describedby={describedby} disabled={value.mode !== TurretsMode.SHIELD} bind:checked={() => value.damage, (damage) => update({ damage })} />
    {/snippet}
  </SettingRow>
</div>

<script lang="ts">
  import { Button, IconButton, Slider } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { X as XIcon } from "phosphor-svelte";
  import { toggle_id, type ActivityDef } from "./activities";
  import { activity_icon } from "./icons";
  import type { Details } from "./mood";

  interface Props {
    activities: readonly ActivityDef[];
    value: Details;
    onchange: (patch: Details) => void;
    class?: string;
  }

  let { activities, value, onchange, class: class_name }: Props = $props();

  const shown = $derived(activities.filter((activity) => !activity.hidden || value.activities?.includes(activity.id)));
</script>

<div class={cn("grid gap-3", class_name)}>
  <div role="group" aria-label="Activities" class="flex flex-wrap gap-1.5">
    {#each shown as activity (activity.id)}
      {@const Icon = activity_icon(activity.icon)}
      <Button size="sm" variant="secondary" pressed={value.activities?.includes(activity.id) ?? false} onclick={() => onchange({ activities: toggle_id(value.activities, activity.id) })}>
        <Icon weight="bold" />{activity.label}
      </Button>
    {/each}
  </div>
  <div class="grid gap-y-1">
    {@render slider("Energy", "energy", 0, 10, 1, value.energy, (v) => `${v}/10`)}
    {@render slider("Sleep", "sleep", 0, 14, 0.5, value.sleep, (v) => `${v} h`)}
  </div>
</div>

{#snippet slider(label: string, field: "energy" | "sleep", min: number, max: number, step: number, current: number | undefined, show: (value: number) => string)}
  <div class="grid grid-cols-[4rem_1fr_auto] items-center gap-2">
    <span class="text-ui text-foreground/80">{label}</span>
    <Slider
      size="sm"
      {min}
      {max}
      {step}
      value={current ?? (field === "sleep" ? 7 : 5)}
      aria-label={label}
      aria-valuetext={current === undefined ? "not set" : show(current)}
      class={cn("w-full", current === undefined && "opacity-50")}
      oninput={(event) => onchange({ [field]: Number(event.currentTarget.value) })}
    />
    <span class="flex w-16 items-center justify-end gap-0.5 font-mono text-2xs text-foreground/80 tabular-nums">
      {current === undefined ? "–" : show(current)}
      {#if current !== undefined}
        <IconButton label={`Clear ${label.toLowerCase()}`} size="sm" class="size-6 pointer-coarse:size-9" onclick={() => onchange({ [field]: undefined })}><XIcon /></IconButton>
      {/if}
    </span>
  </div>
{/snippet}

<script lang="ts">
  import { Button, Section, Segmented, Slider } from "$lib/core/components/ui";
  import { Plus as PlusIcon } from "phosphor-svelte";
  import type { Color } from "./color";
  import ColorField from "./color-field.svelte";
  import { harmonies, HUE_SPACES, MAX_STEPS, MIN_STEPS, steps_between, type HueSpace } from "./harmony";
  import { format_color, parse_css } from "./models";
  import { DEFAULT_STEPS_TO } from "./state";
  import Swatch from "./swatch.svelte";

  interface Props {
    color: Color;
    space: HueSpace;
    steps_to: string;
    steps: number;
    onadd: ((colors: Color[], label: string) => void) | null;
    onchange: (color: Color) => void;
  }

  let { color, space = $bindable(), steps_to = $bindable(), steps = $bindable(), onadd, onchange }: Props = $props();

  const id = $props.id();
  const target = $derived(parse_css(steps_to) ?? parse_css(DEFAULT_STEPS_TO)!);
  const groups = $derived([
    ...harmonies(color, space),
    { id: "steps", label: "Steps", colors: steps_between(color, target, steps, space) },
  ]);
</script>

{#snippet strip(colors: Color[], label: string)}
  <div class="grid gap-1.5" style:grid-template-columns="repeat({colors.length}, minmax(0, 1fr))">
    {#each colors as entry, index (index)}
      <Swatch color={entry} label="{label} {index + 1}: {format_color(entry)}" class="h-12 w-full @md:h-14" onclick={() => onchange(entry)} />
    {/each}
  </div>
{/snippet}

<p class="text-ui text-foreground/65">Schemes built from the current colour by turning its hue. Tap a swatch to make it the current colour.</p>

<Segmented label="Hue space" options={HUE_SPACES} bind:value={space} class="self-start" />

{#each groups as group (group.id)}
  <Section title={group.label} flush>
    {#snippet actions()}
      {#if onadd}
        <Button size="sm" variant="quiet" onclick={() => onadd(group.colors, group.label)}><PlusIcon weight="bold" />Add to palette</Button>
      {/if}
    {/snippet}
    {#if group.id === "steps"}
      <div class="grid gap-3 @md:grid-cols-2 @md:items-end">
        <div class="flex flex-col gap-1">
          <span class="text-2xs font-medium text-foreground/80">From the current colour to</span>
          <ColorField color={target} text={format_color(target)} label="Steps end colour" onchange={(next) => (steps_to = next.toString())} size="sm" />
        </div>
        <div class="flex flex-col gap-0.5">
          <div class="flex items-baseline justify-between text-2xs">
            <label for="{id}-steps" class="font-medium text-foreground/80">Steps</label>
            <span class="font-mono text-foreground/80 tabular-nums">{steps}</span>
          </div>
          <Slider id="{id}-steps" class="w-full" min={MIN_STEPS} max={MAX_STEPS} step={1} bind:value={steps} />
        </div>
      </div>
    {/if}
    {@render strip(group.colors, group.label)}
  </Section>
{/each}

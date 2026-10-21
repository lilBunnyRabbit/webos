<script lang="ts">
  import { Checkbox, IconButton, Input, Select, Slider } from "$lib/core/components/ui";
  import { X as XIcon } from "phosphor-svelte";
  import { CHAR_SET_LABELS, CHAR_SETS, set_characters, type CharSet } from "./charsets";
  import {
    ASCENT,
    DEFAULT_SLANT,
    DESCENT,
    MAX_SCALE,
    MAX_SLANT,
    MIN_SCALE,
    set_slant,
    set_weights,
    style_name,
    WEIGHTS,
    type FontProject,
    type Metrics,
  } from "./model";

  interface Props {
    id: string;
    anchor: string;
    project: FontProject;
    onchange: (change: (project: FontProject) => FontProject) => void;
  }

  let { id, anchor, project, onchange }: Props = $props();

  function rename(value: string) {
    const name = value.trim().slice(0, 100);
    if (name && name !== project.name) onchange((current) => ({ ...current, name }));
  }

  function toggle(set: CharSet, on: boolean) {
    onchange((current) => {
      const sets = on ? [...new Set([...current.sets, set])] : current.sets.filter((item) => item !== set);
      return sets.length ? { ...current, sets: CHAR_SETS.filter((item) => sets.includes(item)) } : current;
    });
  }

  const unused = $derived(WEIGHTS.filter((weight) => !project.weights.some((item) => item.weight === weight)).map((weight) => ({ value: String(weight), label: `${style_name(weight, false)} ${weight}` })));

  // A new weight starts at a width between its neighbours, so 600 lands between Regular and Bold.
  function add_weight(weight: number) {
    if (!weight) return;
    onchange((current) => {
      const below = current.weights.filter((item) => item.weight < weight).at(-1);
      const above = current.weights.find((item) => item.weight > weight);
      const scale = below && above ? below.scale + ((above.scale - below.scale) * (weight - below.weight)) / (above.weight - below.weight) : (below ?? above)!.scale * (weight / (below ?? above)!.weight);
      return set_weights(current, [...current.weights, { weight, scale }]);
    });
  }

  function remove_weight(weight: number) {
    onchange((current) => set_weights(current, current.weights.filter((item) => item.weight !== weight)));
  }

  function set_scale(weight: number, scale: number) {
    onchange((current) => set_weights(current, current.weights.map((item) => (item.weight === weight ? { ...item, scale } : item))));
  }

  function set_metric(key: Exclude<keyof Metrics, "em">, value: number) {
    onchange((current) => {
      const metrics = { ...current.metrics, [key]: Math.round(value) };
      if (key === "cap") metrics.x = Math.min(metrics.x, metrics.cap);
      if (key === "x") metrics.cap = Math.max(metrics.x, metrics.cap);
      return { ...current, metrics };
    });
  }

  const METRICS: { key: Exclude<keyof Metrics, "em">; label: string; min: number; max: number }[] = [
    { key: "cap", label: "Cap height", min: 400, max: ASCENT - 50 },
    { key: "x", label: "x-height", min: 200, max: 800 },
    { key: "descender", label: "Descender", min: 100, max: DESCENT },
    { key: "bearing", label: "Side bearing", min: 0, max: 200 },
  ];
</script>

<div {id} popover="auto" class="fm-popover m-0 w-80 max-w-[calc(100vw-1rem)] rounded-xl bg-background-lighter p-3 text-foreground shadow-popover" style="position-anchor: {anchor}">
  <div class="flex flex-col gap-3">
    <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Font</p>
    <label class="flex flex-col gap-1 text-2xs text-foreground/65">
      Name
      <Input size="sm" value={project.name} maxlength={100} onchange={(event) => rename(event.currentTarget.value)} />
    </label>
    <fieldset class="flex flex-col gap-1.5">
      <legend class="mb-1 text-2xs text-foreground/65">Characters</legend>
      {#each CHAR_SETS as set (set)}
        <label class="flex min-h-7 items-center gap-2 text-ui pointer-coarse:min-h-9">
          <Checkbox
            checked={project.sets.includes(set)}
            disabled={project.sets.length === 1 && project.sets.includes(set)}
            onchange={(event) => toggle(set, event.currentTarget.checked)}
          />
          <span class="flex-1">{CHAR_SET_LABELS[set]}</span>
          <span class="font-mono text-2xs text-foreground/65 tabular-nums">{set_characters(set).length}</span>
        </label>
      {/each}
    </fieldset>
    <fieldset class="flex flex-col gap-1.5">
      <legend class="mb-1 text-2xs text-foreground/65">Weights, as a multiple of the line width</legend>
      {#each project.weights as item (item.weight)}
        <div class="grid grid-cols-[6rem_1fr_2.5rem_auto] items-center gap-2 text-ui">
          <span class="truncate">{style_name(item.weight, false)} <span class="font-mono text-2xs text-foreground/65">{item.weight}</span></span>
          <Slider size="sm" min={MIN_SCALE} max={MAX_SCALE} step={0.05} value={item.scale} aria-label="{style_name(item.weight, false)} width" onchange={(event) => set_scale(item.weight, Number(event.currentTarget.value))} />
          <span class="text-right font-mono text-2xs text-foreground/80 tabular-nums">×{item.scale.toFixed(2)}</span>
          <IconButton label="Remove {style_name(item.weight, false)}" size="sm" disabled={project.weights.length === 1} onclick={() => remove_weight(item.weight)}><XIcon weight="bold" /></IconButton>
        </div>
      {/each}
      {#if unused.length}
        <Select size="sm" aria-label="Add a weight" options={[{ value: "", label: "Add a weight…" }, ...unused]} value="" onchange={(event) => add_weight(Number(event.currentTarget.value))} />
      {/if}
    </fieldset>
    <div class="flex flex-col gap-1.5">
      <label class="flex min-h-7 items-center gap-2 text-ui pointer-coarse:min-h-9">
        <Checkbox checked={!!project.italic} onchange={(event) => onchange((current) => set_slant(current, event.currentTarget.checked ? DEFAULT_SLANT : null))} />
        <span class="flex-1">Italic faces</span>
      </label>
      {#if project.italic}
        <label class="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-ui">
          Slant
          <Slider size="sm" min={0} max={MAX_SLANT} step={1} value={project.italic.slant} onchange={(event) => onchange((current) => set_slant(current, Number(event.currentTarget.value)))} />
          <span class="text-right font-mono text-2xs text-foreground/80 tabular-nums">{project.italic.slant}°</span>
        </label>
      {/if}
    </div>
    <div class="flex flex-col gap-1">
      <p class="text-2xs text-foreground/65">Guides and spacing, in thousandths of the size</p>
      {#each METRICS as metric (metric.key)}
        <label class="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-ui">
          {metric.label}
          <Slider size="sm" min={metric.min} max={metric.max} step={10} value={project.metrics[metric.key]} onchange={(event) => set_metric(metric.key, Number(event.currentTarget.value))} />
          <span class="text-right font-mono text-2xs text-foreground/80 tabular-nums">{project.metrics[metric.key]}</span>
        </label>
      {/each}
    </div>
  </div>
</div>

<style>
  .fm-popover {
    position-area: bottom span-left;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }
</style>

<script lang="ts">
  import { Checkbox, Input, Slider } from "$lib/core/components/ui";
  import { CHAR_SET_LABELS, CHAR_SETS, set_characters, type CharSet } from "./charsets";
  import { ASCENT, DESCENT, type FontProject, type Metrics } from "./model";

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

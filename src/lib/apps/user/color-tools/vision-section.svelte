<script lang="ts">
  import { Segmented, Slider } from "$lib/core/components/ui";
  import type { Color } from "./color";
  import { parse_css } from "./models";
  import type { Palette } from "./palette";
  import { VisionSource } from "./state";
  import Swatch from "./swatch.svelte";
  import { DEFICIENCIES, severity_name, simulate } from "./vision";

  interface Props {
    color: Color;
    palette: Palette | null;
    severity: number;
    source: VisionSource;
    onchange: (color: Color) => void;
  }

  let { color, palette, severity = $bindable(), source = $bindable(), onchange }: Props = $props();

  const id = $props.id();

  const colors = $derived.by((): { color: Color; name: string }[] => {
    if (source === VisionSource.PALETTE && palette) {
      return palette.colors.flatMap((entry) => {
        const parsed = parse_css(entry.css);
        return parsed ? [{ color: parsed, name: entry.name || entry.css }] : [];
      });
    }
    return [{ color, name: "Current colour" }];
  });

  const rows = $derived([
    { id: "normal", label: "Normal vision", detail: "As you see it", colors: colors.map((entry) => entry.color) },
    ...DEFICIENCIES.map((item) => ({
      id: item.value,
      label: severity_name(item.value, severity),
      detail: item.cones,
      colors: colors.map((entry) => simulate(entry.color, item.value, severity)),
    })),
  ]);

  const single = $derived(colors.length === 1);
</script>

<p class="text-ui text-foreground/65">
  How colours look with each kind of colour vision deficiency (Machado 2009). Full severity is the dichromacy, less is the milder anomalous form.
</p>

<div class="flex flex-col gap-3 @md:flex-row @md:items-end @md:gap-6">
  <Segmented
    label="What to preview"
    options={[
      { value: VisionSource.COLOR, label: "Colour" },
      { value: VisionSource.PALETTE, label: "Palette" },
    ]}
    bind:value={source}
    class="self-start @md:self-auto"
  />
  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
    <div class="flex items-baseline justify-between text-2xs">
      <label for="{id}-severity" class="font-medium text-foreground/80">Severity</label>
      <span class="font-mono text-foreground/80 tabular-nums">{Math.round(severity * 100)}%</span>
    </div>
    <Slider id="{id}-severity" class="w-full" min={0} max={1} step={0.05} bind:value={severity} aria-valuetext="{Math.round(severity * 100)}%" />
  </div>
</div>

{#if source === VisionSource.PALETTE && !palette}
  <p class="rounded-xl bg-background-light px-4 py-6 text-center text-ui text-foreground/65 ring-1 ring-foreground/8">
    Open a palette in the Palette section to preview all its colours here.
  </p>
{:else if source === VisionSource.PALETTE && colors.length === 0}
  <p class="rounded-xl bg-background-light px-4 py-6 text-center text-ui text-foreground/65 ring-1 ring-foreground/8">This palette has no colours yet.</p>
{:else}
  <div class={single ? "grid grid-cols-2 gap-3 @md:grid-cols-4" : "flex flex-col gap-3"}>
    {#each rows as row (row.id)}
      <div class="flex min-w-0 flex-col gap-1.5">
        <div class="flex items-baseline gap-2">
          <span class="text-ui font-medium">{row.label}</span>
          {#if !single}<span class="text-2xs text-foreground/80">{row.detail}</span>{/if}
        </div>
        {#if single}
          <Swatch color={row.colors[0]} label="{row.label}: {colors[0].name}" class="aspect-square w-full" onclick={() => onchange(row.colors[0])} />
          <span class="text-2xs text-foreground/80">{row.detail}</span>
        {:else}
          <div class="flex h-12 overflow-hidden rounded-lg ring-1 ring-foreground/10">
            {#each row.colors as shown, index (index)}
              <Swatch color={shown} label="{row.label}: {colors[index].name}" class="h-full min-w-0 flex-1 rounded-none ring-0" />
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

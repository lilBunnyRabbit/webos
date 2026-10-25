<script lang="ts">
  import { Slider } from "$lib/core/components/ui";
  import { to_hex, type Color } from "./color";
  import { channels_of, with_alpha, with_channel, type ColorModel } from "./models";

  interface Props {
    /** The colour already in `model`. */
    color: Color;
    model: ColorModel;
    onchange: (color: Color) => void;
  }

  let { color, model, onchange }: Props = $props();

  const uid = $props.id();
  const channels = $derived(channels_of(model));
  const ALPHA_INDEX = -1;
  // The byte model keeps alpha as 0–255 too.
  const alpha_max = $derived(model.terminal ? 255 : 1);

  function step_of(min: number, max: number): number {
    return model.terminal ? 1 : (max - min) / 1000;
  }

  function shown(value: number): string {
    return String(Number(value.toFixed(Math.abs(value) >= 100 ? 1 : 4)));
  }

  function variant(index: number, value: number): Color {
    return index === ALPHA_INDEX ? with_alpha(color, model, value) : with_channel(color, model, index, value);
  }

  // The track shows what the colour becomes along that channel with the others held: the content's colours, not theme.
  function track(index: number, min: number, max: number, hue: boolean): string {
    const count = hue ? 13 : 9;
    const stops = Array.from({ length: count }, (_, at) => {
      try {
        return to_hex(variant(index, min + ((max - min) * at) / (count - 1)));
      } catch {
        return "transparent";
      }
    });
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }
</script>

{#snippet row(label: string, index: number, value: number, min: number, max: number, hue: boolean)}
  {@const id = `${uid}-${label}`}
  <div class="flex flex-col gap-0.5">
    <div class="flex items-baseline justify-between gap-2 text-2xs">
      <label for={id} class="font-mono font-medium text-foreground/80">{label}</label>
      <span class="font-mono text-foreground/80 tabular-nums">{shown(value)}</span>
    </div>
    <Slider
      {id}
      class="w-full"
      {min}
      {max}
      step={index === ALPHA_INDEX && !model.terminal ? 0.001 : step_of(min, max)}
      value={Math.min(max, Math.max(min, value))}
      aria-valuetext={shown(value)}
      oninput={(event) => onchange(variant(index, Number(event.currentTarget.value)))}
    />
    <div class="track h-1.5 rounded-full ring-1 ring-foreground/10" style:--track={track(index, min, max, hue)} aria-hidden="true"></div>
  </div>
{/snippet}

<div class="grid gap-3 @md:grid-cols-2 @md:gap-x-6">
  {#each channels as channel, index (channel.name)}
    {@render row(channel.name, index, color.coords[index], channel.min, channel.max, channel.hue)}
  {/each}
  {@render row("alpha", ALPHA_INDEX, color.alpha, 0, alpha_max, false)}
</div>

<style>
  .track {
    background:
      var(--track),
      repeating-conic-gradient(color-mix(in oklch, var(--foreground) 12%, transparent) 0 25%, transparent 0 50%) 0 0 / 6px 6px;
  }
</style>

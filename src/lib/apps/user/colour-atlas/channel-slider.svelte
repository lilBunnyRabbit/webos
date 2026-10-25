<script lang="ts">
  import { Slider } from "$lib/core/components/ui";

  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    /** The colours along this channel as a CSS gradient: the game's content, not theme colour. */
    track: string;
    shown: string;
    oninput: (value: number) => void;
  }

  let { label, value, min, max, step, track, shown, oninput }: Props = $props();
  const id = $props.id();
</script>

<div class="flex min-w-0 flex-col">
  <div class="flex items-baseline justify-between gap-2 text-2xs">
    <label for={id} class="font-mono font-medium text-foreground/80">{label}</label>
    <span class="font-mono text-foreground/80 tabular-nums">{shown}</span>
  </div>
  <Slider
    {id}
    class="w-full"
    {min}
    {max}
    {step}
    {value}
    aria-valuetext={shown}
    oninput={(event) => oninput(Number(event.currentTarget.value))}
  />
  <div class="h-3 rounded-full ring-1 ring-foreground/10" style:background={track} aria-hidden="true"></div>
</div>

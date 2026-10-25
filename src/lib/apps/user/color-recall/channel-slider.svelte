<script lang="ts">
  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    /** The channel's colours left to right, as a CSS gradient: the game's data, not theme colour. */
    track: string;
    shown: string;
    element?: HTMLInputElement;
  }

  let { label, value = $bindable(), min, max, step, track, shown, element = $bindable() }: Props = $props();
  const id = $props.id();
</script>

<div class="flex flex-col gap-0.5">
  <div class="flex items-baseline justify-between text-2xs">
    <label for={id} class="font-medium text-foreground/80">{label}</label>
    <span class="font-mono text-foreground/65 tabular-nums" aria-hidden="true">{shown}</span>
  </div>
  <input
    bind:this={element}
    {id}
    type="range"
    class="channel h-11 w-full cursor-pointer appearance-none bg-transparent"
    bind:value
    {min}
    {max}
    {step}
    aria-valuetext={shown}
    style:--track={track}
  />
</div>

<style>
  .channel {
    touch-action: pan-y;
  }

  .channel::-webkit-slider-runnable-track {
    height: 14px;
    border-radius: 9999px;
    background: var(--track);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 15%, transparent);
  }

  .channel::-moz-range-track {
    height: 14px;
    border-radius: 9999px;
    background: var(--track);
  }

  .channel::-webkit-slider-thumb {
    appearance: none;
    width: 24px;
    height: 24px;
    margin-top: -5px;
    border-radius: 9999px;
    background: transparent;
    border: 3px solid var(--foreground);
    box-shadow:
      0 0 0 2px var(--background),
      var(--shadow-raised);
  }

  .channel::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 9999px;
    background: transparent;
    border: 3px solid var(--foreground);
    box-shadow: 0 0 0 2px var(--background);
  }

  .channel:focus-visible {
    outline: none;
  }

  .channel:focus-visible::-webkit-slider-thumb {
    box-shadow:
      0 0 0 2px var(--background),
      0 0 0 4px var(--cottontail);
  }

  .channel:focus-visible::-moz-range-thumb {
    box-shadow:
      0 0 0 2px var(--background),
      0 0 0 4px var(--cottontail);
  }

  @media (pointer: coarse) {
    .channel::-webkit-slider-thumb {
      width: 30px;
      height: 30px;
      margin-top: -8px;
    }
  }
</style>

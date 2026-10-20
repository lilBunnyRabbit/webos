<script lang="ts">
  import { cn } from "$lib/core/utils";

  /** `bare` drops the dial's fill, for a widget sitting straight on the wallpaper. */
  let { now, bare = false, class: class_name }: { now: number; bare?: boolean; class?: string } = $props();

  const date = $derived(new Date(now));
  const seconds = $derived(date.getSeconds());
  const minutes = $derived(date.getMinutes() + seconds / 60);
  const hours = $derived((date.getHours() % 12) + minutes / 60);
  const ticks = Array.from({ length: 60 }, (_, index) => index);
</script>

<svg viewBox="-50 -50 100 100" class={cn("aspect-square", class_name)} role="img" aria-label="Analog clock">
  <circle r="48" class={bare ? "fill-none stroke-foreground/40" : "fill-background stroke-foreground/12"} stroke-width="1" />
  {#each ticks as tick (tick)}
    {@const hour = tick % 5 === 0}
    <line
      y1="-44"
      y2={hour ? -38 : -41.5}
      transform="rotate({tick * 6})"
      class={hour ? "stroke-foreground/70" : "stroke-foreground/25"}
      stroke-width={hour ? 1.6 : 0.7}
      stroke-linecap="round"
    />
  {/each}
  <line y1="4" y2="-24" transform="rotate({hours * 30})" class="stroke-foreground" stroke-width="3.2" stroke-linecap="round" />
  <line y1="5" y2="-36" transform="rotate({minutes * 6})" class="stroke-foreground" stroke-width="2.2" stroke-linecap="round" />
  <line y1="8" y2="-39" transform="rotate({seconds * 6})" class="stroke-primary" stroke-width="0.9" stroke-linecap="round" />
  <circle r="2.2" class="fill-primary" />
</svg>

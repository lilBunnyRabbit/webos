<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { level_of, push_level } from "./media";

  const BARS = 48;

  let { analyser, running, class: class_name }: { analyser: AnalyserNode | null; running: boolean; class?: string } = $props();

  let levels = $state.raw<number[]>(Array(BARS).fill(0));

  $effect(() => {
    if (!analyser || !running) return;
    const node = analyser;
    const samples = new Uint8Array(node.fftSize);
    let frame = 0;
    let last = 0;
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      if (time - last < 50) return;
      last = time;
      node.getByteTimeDomainData(samples);
      levels = push_level(levels, level_of(samples), BARS);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class={cn("flex h-24 w-full max-w-md items-center justify-center gap-0.5", class_name)} aria-hidden="true">
  {#each levels as level, index (index)}
    <span
      class={cn("max-w-1 min-w-px flex-1 rounded-full transition-[height] duration-75", running ? "bg-primary" : "bg-foreground/30")}
      style:height="{Math.max(4, level * 100)}%"
    ></span>
  {/each}
</div>

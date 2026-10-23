<script lang="ts">
  import { clamp } from "$lib/core/utils";
  import { format_time } from "$kit/utils/video/plan";

  interface Props {
    duration: number;
    time: number;
    from: number;
    to: number;
    step: number;
    disabled?: boolean;
    onseek: (time: number) => void;
    onrange: (from: number, to: number) => void;
  }

  const { duration, time, from, to, step, disabled = false, onseek, onrange }: Props = $props();

  type Grip = "from" | "to" | "head";
  let track = $state<HTMLDivElement>();
  let grip = $state<Grip | null>(null);

  const percent = (value: number) => `${duration > 0 ? (clamp(value, 0, duration) / duration) * 100 : 0}%`;

  function time_at(event: PointerEvent): number {
    const rect = track!.getBoundingClientRect();
    return clamp((event.clientX - rect.left) / rect.width, 0, 1) * duration;
  }

  function move(target: Grip, value: number) {
    if (target === "head") return onseek(value);
    if (target === "from") onrange(Math.min(value, to - step), to);
    else onrange(from, Math.max(value, from + step));
    onseek(target === "from" ? Math.min(value, to - step) : Math.max(value, from + step));
  }

  function start(target: Grip) {
    return (event: PointerEvent) => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      grip = target;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      move(target, time_at(event));
    };
  }

  function drag(event: PointerEvent) {
    if (grip) move(grip, time_at(event));
  }

  function key(target: "from" | "to") {
    return (event: KeyboardEvent) => {
      const delta = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0;
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      move(target, (target === "from" ? from : to) + delta * (event.shiftKey ? 1 : step));
    };
  }
</script>

<div
  bind:this={track}
  class={["relative h-10 touch-none select-none pointer-coarse:h-12", disabled ? "opacity-38" : "cursor-pointer"]}
  role="presentation"
  onpointerdown={start("head")}
  onpointermove={drag}
  onlostpointercapture={() => (grip = null)}
>
  <div class="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-field shadow-track"></div>
  <div class="absolute top-1/2 h-2 -translate-y-1/2 bg-primary/45" style:left={percent(from)} style:right="calc(100% - {percent(to)})"></div>
  <div class="pointer-events-none absolute inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground" style:left={percent(time)}></div>
  {#each [["from", from], ["to", to]] as const as [target, value] (target)}
    <button
      type="button"
      class="absolute inset-y-0 grid w-4 -translate-x-1/2 cursor-ew-resize place-items-center focus-visible:outline-none pointer-coarse:w-7"
      style:left={percent(value)}
      role="slider"
      aria-label={target === "from" ? "In point" : "Out point"}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 100) / 100}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuetext={format_time(value)}
      {disabled}
      onpointerdown={start(target)}
      onkeydown={key(target)}
    >
      <span class="handle h-7 w-2 rounded-xs bg-primary pointer-coarse:h-9 pointer-coarse:w-2.5"></span>
    </button>
  {/each}
</div>

<style>
  button:focus-visible .handle {
    outline: 2px solid var(--cottontail);
    outline-offset: 2px;
  }
</style>

<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { Sun as SunIcon } from "phosphor-svelte";
  import Barcode from "./barcode.svelte";
  import { CODE_FIELD, CODE_TEXT } from "./colors";
  import { display_name, type Card } from "./data";
  import { CardFormat, FORMATS } from "./formats";

  let { card, onclose }: { card: Card; onclose: () => void } = $props();

  const shape = $derived(FORMATS[card.format].shape);
  let awake = $state(false);

  const focus_on_open = (node: HTMLElement) => node.focus({ preventScroll: true });

  $effect(() => {
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || lock) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (!live) return void sentinel.release();
        lock = sentinel;
        awake = true;
        sentinel.addEventListener("release", () => {
          lock = null;
          awake = false;
        });
      } catch {
        awake = false;
      }
    };
    document.addEventListener("visibilitychange", acquire);
    void acquire();
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  });

  function on_keydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onclose();
  }
</script>

<button
  type="button"
  class={cn("absolute inset-0 z-20 flex animate-pop-in cursor-pointer flex-col items-center justify-center gap-4 p-5 outline-none @md:p-8", CODE_FIELD, CODE_TEXT)}
  aria-label="Close {display_name(card)}"
  onclick={onclose}
  onkeydown={on_keydown}
  {@attach focus_on_open}
>
  <span class="max-w-full truncate text-lg font-semibold">{display_name(card)}</span>
  {#if card.format !== CardFormat.NONE}
    <span
      class={cn(
        "flex w-full justify-center",
        shape === "linear" && "max-w-[40rem]",
        shape === "stacked" && "max-w-[44rem]",
        shape === "square" && "max-w-[min(100%,26rem,60cqh)]"
      )}
    >
      <Barcode format={card.format} code={card.code} class={shape === "linear" ? "max-h-[40cqh]" : undefined} />
    </span>
  {/if}
  <span
    class={cn(
      "max-w-full font-mono font-semibold tracking-wider break-all tabular-nums",
      card.format === CardFormat.NONE ? "text-4xl @md:text-5xl" : "text-xl @md:text-2xl"
    )}
  >
    {card.code}
  </span>
  <span class="mt-2 flex items-center gap-1.5 text-ui opacity-70">
    <SunIcon class="size-4" weight={awake ? "fill" : "regular"} />
    {awake ? "Screen stays on · tap to close" : "Tap to close"}
  </span>
</button>

<script lang="ts" module>
  // A key under a thumb gives no click; a short buzz says it took. Touch only: a mouse or pen already feels its press.
  export function buzz(event: PointerEvent): void {
    if (event.pointerType === "touch") navigator.vibrate?.(8);
  }
</script>

<script lang="ts">
  import { button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Backspace as BackspaceIcon } from "phosphor-svelte";
  import { NumpadKey } from "./units";

  interface Props {
    onpress: (key: string) => void;
    class?: string;
  }

  let { onpress, class: class_name }: Props = $props();

  const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", NumpadKey.POINT, "0", NumpadKey.BACK];

  // The sketch keeps keyboard focus, so typing on a desktop keyboard keeps working after a click on the pad.
  function keep_focus(event: PointerEvent) {
    event.preventDefault();
    buzz(event);
  }
</script>

<div class={cn("grid grid-cols-3 gap-1.5", class_name)} role="group" aria-label="Numpad">
  {#each KEYS as key (key)}
    <button
      type="button"
      tabindex={-1}
      class={button({ variant: "secondary", class: "key h-full min-h-11 rounded-lg font-mono text-xl tabular-nums" })}
      aria-label={key === NumpadKey.BACK ? "Backspace" : key === NumpadKey.POINT ? "Decimal point" : key}
      onpointerdown={keep_focus}
      onclick={() => onpress(key)}
    >
      {#if key === NumpadKey.BACK}<BackspaceIcon class="size-5" weight="bold" />{:else}{key}{/if}
    </button>
  {/each}
</div>

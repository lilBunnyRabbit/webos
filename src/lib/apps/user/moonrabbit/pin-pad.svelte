<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { Backspace as BackspaceIcon } from "phosphor-svelte";
  import { PIN_LENGTH } from "./quick";

  interface Props {
    label: string;
    busy?: boolean;
    onsubmit: (pin: string) => void;
  }

  let { label, busy = false, onsubmit }: Props = $props();

  let pin = $state("");

  function press(digit: string) {
    if (busy || pin.length >= PIN_LENGTH) return;
    pin += digit;
    if (pin.length === PIN_LENGTH) {
      const value = pin;
      setTimeout(() => {
        pin = "";
        onsubmit(value);
      }, 120);
    }
  }

  function back() {
    pin = pin.slice(0, -1);
  }

  function on_key(event: KeyboardEvent) {
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      press(event.key);
    } else if (event.key === "Backspace") {
      event.preventDefault();
      back();
    }
  }

  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const key_class = "grid h-12 place-items-center rounded-xl bg-background-light text-lg font-medium tabular-nums ring-1 ring-foreground/8 hover:bg-foreground/8 active:scale-95 disabled:opacity-38 transition-[background-color,transform]";
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="grid w-full max-w-64 justify-items-center gap-4 rounded-xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-cottontail" role="group" aria-label={label} tabindex="0" onkeydown={on_key} {@attach (element) => element.focus({ preventScroll: true })}>
  <div class="flex gap-2.5" role="status" aria-label={`${pin.length} of ${PIN_LENGTH} digits`}>
    {#each Array.from({ length: PIN_LENGTH }, (_, i) => i) as i (i)}
      <span class={cn("size-3 rounded-full ring-1 ring-foreground/30 transition-colors", i < pin.length && "bg-primary ring-primary")}></span>
    {/each}
  </div>
  <div class="grid w-full grid-cols-3 gap-2">
    {#each KEYS as key (key)}
      <button type="button" tabindex="-1" class={key_class} disabled={busy} onclick={() => press(key)}>{key}</button>
    {/each}
    <span></span>
    <button type="button" tabindex="-1" class={key_class} disabled={busy} onclick={() => press("0")}>0</button>
    <button type="button" tabindex="-1" class={key_class} disabled={busy || !pin} aria-label="Delete digit" onclick={back}><BackspaceIcon class="size-5" /></button>
  </div>
</div>

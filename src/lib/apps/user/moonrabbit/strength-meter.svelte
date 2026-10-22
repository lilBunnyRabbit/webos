<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { Strength, strength_of } from "./passphrase";

  let { bits }: { bits: number } = $props();

  const strength = $derived(strength_of(bits));
  const filled = $derived(bits === 0 ? 0 : strength === Strength.WEAK ? 1 : strength === Strength.FAIR ? 2 : 3);
  const tone = $derived(strength === Strength.WEAK ? "bg-error" : strength === Strength.FAIR ? "bg-warning" : "bg-success");
  const label = $derived(
    bits === 0
      ? "Type a phrase"
      : strength === Strength.WEAK
        ? "Too weak: anyone with a copy of the files could guess it"
        : strength === Strength.FAIR
          ? "Fair: a few more words make it strong"
          : "Strong"
  );
</script>

<div class="grid gap-1.5">
  <div class="grid grid-cols-3 gap-1" aria-hidden="true">
    {#each [1, 2, 3] as step (step)}
      <span class={cn("h-1 rounded-full", step <= filled ? tone : "bg-foreground/10")}></span>
    {/each}
  </div>
  <p class="text-2xs text-foreground/80" aria-live="polite">{label}{bits > 0 ? ` · about ${bits} bits` : ""}</p>
</div>

<script lang="ts">
  import { cn } from "$lib/core/utils";
  import LogoMark from "./logo-mark.svelte";

  interface Props {
    height?: number;
    /** `brand` colours the mark primary (the wordmark stays foreground); `neutral` keeps both foreground. */
    tone?: "brand" | "neutral";
    class?: string;
  }

  let { height = 32, tone = "brand", class: class_name }: Props = $props();
  const mark_class = $derived(tone === "brand" ? "text-primary" : undefined);
</script>

<span class={cn("inline-flex items-center text-foreground", class_name)} style:gap="{height * 0.3}px">
  {#if height >= 32}
    <LogoMark class={mark_class} style="height: {height}px; width: auto;" title="" aria-hidden="true" />
    <span class="font-mono font-bold tracking-[-0.02em] leading-none" style:font-size="{height * 0.42}px">
      lilBunnyRabbit
    </span>
  {:else}
    <LogoMark class={mark_class} style="height: {height}px; width: auto;" />
  {/if}
</span>

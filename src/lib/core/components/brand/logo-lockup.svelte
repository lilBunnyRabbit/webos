<script lang="ts">
  import { cn } from "$lib/core/utils";
  import LogoMark from "./logo-mark.svelte";

  interface Props {
    height?: number;
    class?: string;
  }

  let { height = 32, class: class_name }: Props = $props();
</script>

<span class={cn("inline-flex items-center text-foreground", class_name)} style:gap="{height * 0.3}px">
  {#if height >= 32}
    <LogoMark style="height: {height}px; width: auto;" title="" aria-hidden="true" />
    <span class="font-mono font-bold tracking-[-0.02em] leading-none" style:font-size="{height * 0.42}px">
      lilBunnyRabbit
    </span>
  {:else}
    <LogoMark style="height: {height}px; width: auto;" />
  {/if}
</span>

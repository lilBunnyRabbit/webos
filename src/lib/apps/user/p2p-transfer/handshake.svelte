<script lang="ts">
  import { Check as CheckIcon } from "phosphor-svelte";
  import { cn } from "$lib/core/utils";

  /** `step` is the one in progress, 0-based; `steps.length` means all done. */
  let { steps, step }: { steps: string[]; step: number } = $props();
</script>

<ol class="flex items-center gap-2 font-mono text-2xs font-medium tracking-wide uppercase" aria-label="Connection steps">
  {#each steps as label, index (label)}
    {@const done = index < step}
    {@const active = index === step}
    {#if index > 0}
      <li aria-hidden="true" class={cn("h-px min-w-3 flex-1 transition-colors duration-150", done || active ? "bg-primary" : "bg-foreground/16")}></li>
    {/if}
    <li class={cn("flex shrink-0 items-center gap-1.5", done || active ? "text-foreground" : "text-foreground/80")} aria-current={active ? "step" : undefined}>
      <span
        class={cn(
          "grid size-5 place-items-center rounded-full tabular-nums ring-1 ring-inset",
          done && "bg-primary text-background ring-primary",
          active && "text-primary ring-primary motion-safe:animate-pulse",
          !done && !active && "ring-foreground/30"
        )}
      >
        {#if done}<CheckIcon weight="bold" class="size-3" />{:else}{index + 1}{/if}
      </span>
      {label}
    </li>
  {/each}
</ol>

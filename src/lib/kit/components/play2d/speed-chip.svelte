<script lang="ts">
  import { cn } from "$lib/core/utils";

  interface Props {
    speed: number;
    class?: string;
  }

  let { speed, class: class_name }: Props = $props();
</script>

<div class={cn("rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]", class_name)} aria-hidden="true">
  {Math.round(Math.abs(speed) * 3.6)} <span class="text-foreground/65">km/h</span>
</div>

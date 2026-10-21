<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { CircleNotch as CircleNotchIcon } from "phosphor-svelte";

  interface Props {
    label?: string;
    class?: string;
  }

  let { label = "Loading", class: class_name }: Props = $props();
</script>

<span role="status" aria-label={label} class={cn("inline-flex text-foreground/65", class_name)}>
  <CircleNotchIcon class="size-4 animate-spin" weight="bold" />
</span>

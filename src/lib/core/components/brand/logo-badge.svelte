<script lang="ts">
  import { cn } from "$lib/core/utils";
  import LogoMark from "./logo-mark.svelte";

  interface Props {
    class?: string;
  }

  let { class: class_name }: Props = $props();
</script>

<span class={cn("inline-grid place-items-center rounded-full bg-primary text-background aspect-square", class_name)}>
  <LogoMark class="w-[55%] h-auto" />
</span>

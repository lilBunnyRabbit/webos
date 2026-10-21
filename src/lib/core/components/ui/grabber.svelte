<script lang="ts">
  import { cn } from "$lib/core/utils";

  let { class: class_name }: { class?: string } = $props();
</script>

<!-- Only the cue: the swipe itself is `swipe_dismiss` on the sheet, and Back, the scrim or Cancel are the accessible ways out. -->
<span class={cn("mx-auto block h-1 w-9 shrink-0 rounded-full bg-foreground/25", class_name)} aria-hidden="true"></span>

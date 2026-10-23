<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { TextView } from "../engine/step";
  import { TONE_TINT } from "./tones";

  let { view }: { view: TextView } = $props();
</script>

<div class="flex flex-wrap gap-1">
  {#each view.lines as line, index (index)}
    <span
      class={cn(
        "rounded-md px-2 py-1 font-mono text-ui break-all whitespace-pre-wrap ring-1 ring-inset",
        line.tone ? TONE_TINT[line.tone] : "bg-background-light ring-hairline"
      )}>{line.text}</span
    >
  {/each}
</div>

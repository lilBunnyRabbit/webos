<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { mood_fill } from "./icons";
  import { MOOD_LABELS, MOODS } from "./mood";
</script>

<ul class="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-foreground/80" aria-label="Legend">
  {#each MOODS as mood (mood)}
    <li class="flex items-center gap-1"><span class={cn("size-3 rounded-sm", mood_fill(mood, true))}></span>{MOOD_LABELS[mood]}</li>
  {/each}
  <li class="flex items-center gap-1"><span class={cn("size-3 rounded-sm", mood_fill(null, true))}></span>No mood</li>
</ul>

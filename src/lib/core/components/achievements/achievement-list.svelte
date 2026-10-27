<script lang="ts">
  import type { AchievementEntry } from "$lib/core/api";
  import { cn, format_date } from "$lib/core/utils";
  import { LockSimple as LockSimpleIcon, Trophy as TrophyIcon } from "phosphor-svelte";

  interface Props {
    entries: AchievementEntry[];
    class?: string;
  }

  let { entries, class: class_name }: Props = $props();
</script>

<ul class={cn("grid gap-2 @xl:grid-cols-2", class_name)}>
  {#each entries as entry (entry.def.id)}
    {@const hidden = entry.def.secret && !entry.unlocked}
    {@const goal = entry.def.goal}
    <li class={cn("flex gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8", !entry.unlocked && "text-foreground/80")}>
      <span
        class={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          entry.unlocked ? "bg-primary/12 text-primary" : "bg-foreground/6 text-foreground/45"
        )}
      >
        {#if entry.unlocked}
          <TrophyIcon class="size-4.5" weight="fill" />
        {:else}
          <LockSimpleIcon class="size-4" weight="bold" />
        {/if}
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <div class="flex items-baseline gap-2">
          <h4 class="min-w-0 flex-1 truncate text-ui font-semibold">{hidden ? "Secret" : entry.def.title}</h4>
          {#if entry.unlocked_at !== null}
            <time class="shrink-0 font-mono text-2xs text-foreground/65" datetime={new Date(entry.unlocked_at).toISOString()}>
              {format_date(new Date(entry.unlocked_at))}
            </time>
          {/if}
        </div>
        <p class="text-2xs text-pretty text-foreground/65">{hidden ? "Unlock it to see what it is." : entry.def.text}</p>
        {#if goal !== undefined && !entry.unlocked && !hidden}
          <div class="mt-1 flex items-center gap-2">
            <div
              class="h-1 flex-1 overflow-hidden rounded-full bg-foreground/8"
              role="progressbar"
              aria-label="{entry.def.title} progress"
              aria-valuemin={0}
              aria-valuemax={goal}
              aria-valuenow={entry.progress}
            >
              <div class="h-full rounded-full bg-primary" style:width="{(entry.progress / goal) * 100}%"></div>
            </div>
            {#if entry.progress_text}<span class="shrink-0 font-mono text-2xs tabular-nums text-foreground/65">{entry.progress_text}</span>{/if}
          </div>
        {/if}
      </div>
    </li>
  {/each}
</ul>

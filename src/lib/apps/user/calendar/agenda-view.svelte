<script lang="ts">
  import { day_minutes } from "$lib/apps/user/work-hours/data";
  import { Button, EmptyState } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { CalendarBlank as CalendarBlankIcon, Plus as PlusIcon } from "phosphor-svelte";
  import { day_title } from "./calendar";
  import DayList from "./day-list.svelte";
  import type { CalendarActions, DaySources } from "./view";

  let { days, today, sources, actions }: { days: string[]; today: string; sources: DaySources; actions: CalendarActions } = $props();

  const busy = $derived(days.filter((day) => day === today || sources.events(day).length > 0 || sources.due(day).length > 0 || day_minutes(sources.work(day)) > 0));
</script>

{#if busy.length === 0}
  <EmptyState icon={CalendarBlankIcon} title="Nothing coming up" description="No events in these 30 days." />
{:else}
  <div class="h-full overflow-auto">
    <div class="mx-auto grid max-w-2xl gap-4 p-2 @md:p-4">
      {#each busy as day (day)}
        <section class="grid gap-1.5" aria-label={day_title(day, today)}>
          <div class="flex items-center gap-2 px-1">
            <h2 class={cn("min-w-0 flex-1 truncate text-sm font-semibold", day === today && "text-primary")}>{day_title(day, today)}</h2>
            <Button variant="quiet" size="sm" class="shrink-0" aria-label="New event on {day_title(day, today)}" onclick={() => actions.create(day)}><PlusIcon weight="bold" /><span class="hidden @sm:inline">Event</span></Button>
          </div>
          <DayList {day} {sources} {actions} empty="Nothing planned today" />
        </section>
      {/each}
    </div>
  </div>
{/if}

<script lang="ts">
  import kernel, { type AppsService, type TasksService } from "$lib/core/api";
  import { CircleNotch as CircleNotchIcon } from "phosphor-svelte";

  const tasks = $derived(kernel.service<TasksService>("tasks"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const count = $derived(tasks.active_count);
  const label = $derived(`${count} ${count === 1 ? "task" : "tasks"} running`);
</script>

{#if count > 0}
  <button
    aria-label={label}
    title={label}
    class="relative grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-150 hover:bg-foreground/10"
    onclick={() => apps.launch("activity-monitor", { section: "tasks" })}
  >
    <CircleNotchIcon class="size-4.5 animate-spin text-primary" weight="bold" />
    {#if count > 1}
      <span class="absolute top-1 right-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-background" aria-hidden="true"
        >{count}</span
      >
    {/if}
  </button>
{/if}

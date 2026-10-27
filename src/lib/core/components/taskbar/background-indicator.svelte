<script lang="ts">
  import kernel, { type AppsService, type BackgroundService } from "$lib/core/api";

  const background = $derived(kernel.service<BackgroundService>("background"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const jobs = $derived(background.list());
  const first = $derived(jobs[0] ? apps.get(jobs[0].app_id) : undefined);
  const label = $derived(
    jobs.length === 1 && first ? `${first.name} is running in the background` : `${jobs.length} apps running in the background`
  );
</script>

{#if jobs.length > 0 && first}
  <button
    aria-label={label}
    title={label}
    class="relative grid size-(--taskbar-item) shrink-0 place-items-center rounded-xl transition-colors duration-150 hover:bg-foreground/10"
    onclick={() => apps.launch("activity-monitor", { section: "background" })}
  >
    <first.icon class="size-[calc(var(--taskbar-item)*0.45)]" weight="duotone" />
    <span class="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background-light" aria-hidden="true"></span>
  </button>
{/if}

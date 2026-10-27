<script lang="ts">
  import kernel, { format_since, type AppsService, type BackgroundService } from "$lib/core/api";
  import { Badge, EmptyState, IconButton, Section } from "$lib/core/components/ui";
  import { ArrowSquareOut as ArrowSquareOutIcon, Broadcast as BroadcastIcon, Stop as StopIcon } from "phosphor-svelte";
  import { report_error } from "$kit/utils/report-error";

  const background = $derived(kernel.service<BackgroundService>("background"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const jobs = $derived(background.list());

  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  const app_name = (id: string) => apps.get(id)?.name ?? id;

  async function stop(app_id: string) {
    try {
      await background.stop(app_id);
    } catch (error) {
      report_error("activity-monitor", `Couldn't stop ${app_name(app_id)}`, error);
    }
  }
</script>

<Section title="Background apps" description="Apps running with no window, one per app across your tabs. A reload stops them; some offer Resume.">
  {#if jobs.length === 0}
    <EmptyState icon={BroadcastIcon} title="Nothing in the background" description="Motion Watch keeps watching here after its window closes." />
  {:else}
    <ul class="divide-y divide-foreground/8">
      {#each jobs as job (job.app_id)}
        {@const manifest = apps.get(job.app_id)}
        <li class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-ui">
          {#if manifest}<manifest.icon class="size-5" weight="duotone" />{:else}<span class="size-5"></span>{/if}
          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate">{app_name(job.app_id)}</span>
            <Badge tone={job.here ? "primary" : "neutral"} class="shrink-0">{job.here ? "This tab" : job.solo ? "Solo tab" : "Another tab"}</Badge>
          </div>
          <div class="flex items-center gap-1">
            <IconButton label="Open {app_name(job.app_id)}" size="sm" onclick={() => apps.launch(job.app_id)}><ArrowSquareOutIcon /></IconButton>
            <IconButton label="Stop {app_name(job.app_id)}" size="sm" onclick={() => stop(job.app_id)}><StopIcon weight="fill" /></IconButton>
          </div>
          <div class="col-start-2 flex min-w-0 items-center gap-3 text-2xs text-foreground/65">
            <span class="min-w-0 truncate">{job.status || "Running"}</span>
            <span class="ml-auto shrink-0 tabular-nums">{format_since(job.since, now)}</span>
          </div>
          {#if job.workers.length > 0}
            <div class="col-start-2 flex min-w-0 flex-col gap-0.5 text-2xs text-foreground/65">
              <span>{job.workers.length} {job.workers.length === 1 ? "worker" : "workers"}</span>
              {#each job.workers as worker (worker.id)}
                <span class="flex gap-3 pl-3 font-mono"><span class="min-w-0 truncate">{worker.name}</span><span class="ml-auto shrink-0 tabular-nums">{format_since(worker.since, now)}</span></span>
              {/each}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Section>

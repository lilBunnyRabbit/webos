<script lang="ts">
  import kernel, { TaskJobStatus, type AppsService, type TasksService } from "$lib/core/api";
  import { Badge, Button, EmptyState, IconButton, Section } from "$lib/core/components/ui";
  import { ArrowClockwise as ArrowClockwiseIcon, ListChecks as ListChecksIcon, Stop as StopIcon, X as XIcon } from "phosphor-svelte";

  const tasks = $derived(kernel.service<TasksService>("tasks"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const TONE = {
    [TaskJobStatus.RUNNING]: "primary",
    [TaskJobStatus.DONE]: "success",
    [TaskJobStatus.FAILED]: "error",
    [TaskJobStatus.CANCELLED]: "warning",
  } as const;

  const finished = $derived(tasks.jobs.length - tasks.active_count);
  const app_name = (id: string) => apps.get(id)?.name ?? id;
</script>

<Section title="Background tasks" description="Work apps run outside their window, newest first. A reload ends them.">
  {#snippet actions()}
    {#if finished > 0}
      <Button size="sm" variant="quiet" onclick={() => tasks.clear()}>Clear finished</Button>
    {/if}
  {/snippet}

  {#if tasks.jobs.length === 0}
    <EmptyState icon={ListChecksIcon} title="No tasks" description="Compressing, extracting and PDF jobs show up here." />
  {:else}
    <ul class="divide-y divide-foreground/8">
      {#each tasks.jobs as job (job.id)}
        <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-ui">
          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate" title={job.title}>{job.title}</span>
            <Badge tone={TONE[job.status]} class="shrink-0">{job.status}</Badge>
          </div>
          <div class="flex items-center gap-1">
            {#if job.status === TaskJobStatus.RUNNING}
              <IconButton label="Cancel {job.title}" size="sm" onclick={() => job.cancel()}><StopIcon weight="fill" /></IconButton>
            {:else}
              {#if job.status !== TaskJobStatus.DONE}
                <IconButton label="Retry {job.title}" size="sm" onclick={() => tasks.retry(job.id)}><ArrowClockwiseIcon weight="bold" /></IconButton>
              {/if}
              <IconButton label="Remove {job.title}" size="sm" onclick={() => tasks.remove(job.id)}><XIcon weight="bold" /></IconButton>
            {/if}
          </div>
          <div class="col-span-2 flex min-w-0 items-center gap-3 text-2xs text-foreground/65">
            <span class="shrink-0">{app_name(job.app_id)}</span>
            <span class="min-w-0 truncate">{job.error ?? job.message ?? ""}</span>
          </div>
          {#if job.status === TaskJobStatus.RUNNING}
            <div class="col-span-2 h-1 overflow-hidden rounded-full bg-foreground/12">
              <div class="h-full rounded-full bg-primary transition-[width] duration-300" style:width="{job.progress * 100}%"></div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Section>

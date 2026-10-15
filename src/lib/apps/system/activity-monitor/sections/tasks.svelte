<script lang="ts">
  import kernel, { TaskJobStatus, type AppsService, type TasksService } from "$lib/core/api";
  import { Badge, Button, button, EmptyState, IconButton, Section } from "$lib/core/components/ui";
  import { version as task_manager_version } from "@lilbunnyrabbit/task-manager/package.json";
  import { cn } from "$lib/core/utils";
  import { ArrowClockwise as ArrowClockwiseIcon, ArrowSquareOut as ArrowSquareOutIcon, Package as PackageIcon, CaretRight as CaretRightIcon, ListChecks as ListChecksIcon, Stop as StopIcon, X as XIcon } from "phosphor-svelte";
  import { SvelteSet } from "svelte/reactivity";
  import TaskDetails from "../task-details.svelte";

  const tasks = $derived(kernel.service<TasksService>("tasks"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const TONE = {
    [TaskJobStatus.RUNNING]: "primary",
    [TaskJobStatus.DONE]: "success",
    [TaskJobStatus.FAILED]: "error",
    [TaskJobStatus.CANCELLED]: "warning",
  } as const;

  const expanded = new SvelteSet<string>();
  const finished = $derived(tasks.jobs.length - tasks.active_count);
  const app_name = (id: string) => apps.get(id)?.name ?? id;

  function toggle(id: string) {
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
  }
</script>

<Section title="Background tasks" description="Work apps run outside their window, newest first. A reload ends them.">
  {#snippet actions()}
    {#if finished > 0}
      <Button size="sm" variant="quiet" onclick={() => tasks.clear()}>Clear finished</Button>
    {/if}
  {/snippet}

  {#if tasks.jobs.length === 0}
    <EmptyState icon={ListChecksIcon} title="No tasks" description="Compressing, extracting and PDF jobs show up here. The Example app runs a demo." />
  {:else}
    <ul class="divide-y divide-foreground/8">
      {#each tasks.jobs as job (job.id)}
        {@const open = expanded.has(job.id)}
        <li class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-3 py-2.5 text-ui">
          <IconButton label="{open ? 'Hide' : 'Show'} details of {job.title}" size="sm" onclick={() => toggle(job.id)} aria-expanded={open}>
            <CaretRightIcon class={cn("transition-transform", open && "rotate-90")} weight="bold" />
          </IconButton>
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
          <div class="col-span-2 col-start-2 flex min-w-0 items-center gap-3 text-2xs text-foreground/65">
            <span class="shrink-0">{app_name(job.app_id)}</span>
            <span class="min-w-0 truncate">{job.error ?? job.message ?? ""}</span>
            <span class="ml-auto shrink-0 tabular-nums">{Math.round(job.progress * 100)}%</span>
          </div>
          {#if job.status === TaskJobStatus.RUNNING}
            <div class="col-span-2 col-start-2 h-1 overflow-hidden rounded-full bg-foreground/12">
              <div class="h-full rounded-full bg-primary transition-[width] duration-300" style:width="{job.progress * 100}%"></div>
            </div>
          {/if}
          {#if open}
            <div class="col-span-2 col-start-2">
              <TaskDetails {job} />
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Section>

<section aria-label="Task engine" class="flex items-center gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8 @container">
  <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
    <PackageIcon class="size-5" weight="duotone" />
  </span>
  <div class="min-w-0 flex-1">
    <p class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span class="truncate font-mono text-ui font-semibold">@lilbunnyrabbit/task-manager</span>
      <Badge>v{task_manager_version}</Badge>
    </p>
    <p class="text-2xs text-foreground/65">Every task above runs on it: tasks, groups and a manager per run, with progress, logs and sequential or parallel steps.</p>
  </div>
  <div class="flex shrink-0 flex-col gap-1.5 @md:flex-row">
    <a class={button({ variant: "secondary", size: "sm" })} href="https://lilbunnyrabbit.github.io/task-manager" target="_blank" rel="noopener noreferrer">
      Docs <ArrowSquareOutIcon weight="bold" />
    </a>
    <a class={button({ variant: "secondary", size: "sm" })} href="https://www.npmjs.com/package/@lilbunnyrabbit/task-manager" target="_blank" rel="noopener noreferrer">
      npm <ArrowSquareOutIcon weight="bold" />
    </a>
  </div>
</section>

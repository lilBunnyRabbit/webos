<script lang="ts">
  import kernel, { ChangeKind, UpdateStage, type VersionService } from "$lib/core/api";
  import { progress_line } from "$lib/core/api/services/version/precache";
  import { compare_versions } from "$lib/core/api/services/version/semver";
  import { cn } from "$lib/core/utils";
  import { Check as CheckIcon } from "phosphor-svelte";
  import { fade } from "svelte/transition";
  import { motion_reduced } from "$lib/core/utils/motion";
  import LogoMark from "../brand/logo-mark.svelte";
  import { Badge, Button, Spinner } from "../ui";

  const version = $derived(kernel.service<VersionService>("version"));

  const STEPS = [
    { stage: UpdateStage.INSTALLING, label: "Downloading the new version" },
    { stage: UpdateStage.CLEARING, label: "Clearing the old one" },
    { stage: UpdateStage.RELOADING, label: "Restarting" },
  ];

  const current = $derived(STEPS.findIndex((step) => step.stage === version.update_stage));
  const progress = $derived(version.update_progress);

  let now = $state(Date.now());
  $effect(() => {
    if (!progress) return;
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  const fraction = $derived(progress?.total ? Math.min(progress.done / progress.total, 1) : 0);

  const KINDS = {
    [ChangeKind.NEW]: { label: "New", tone: "primary" },
    [ChangeKind.IMPROVED]: { label: "Improved", tone: "info" },
    [ChangeKind.FIXED]: { label: "Fixed", tone: "success" },
  } as const;
  const notes = $derived((version.update_available?.notes ?? []).filter((note) => !version.info || compare_versions(note.version, version.info.version) > 0));
</script>

<!-- Covers both shells while "Update and reload" runs; it stays up until the page navigates away. -->
{#if version.update_stage !== UpdateStage.IDLE}
  <div
    role="alertdialog"
    aria-modal="true"
    aria-label="Updating WebOS"
    class="@container fixed inset-0 z-[10000] grid place-items-center bg-background-darkest p-4 text-foreground"
    transition:fade={{ duration: motion_reduced() ? 0 : 150 }}
  >
    <div class="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_at_top,var(--background-dark),transparent_70%)]"></div>
    <div
      class={cn(
        "relative grid max-h-full w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl bg-background-dark/80 ring-1 ring-foreground/8",
        notes.length > 0 ? "max-w-3xl @2xl:max-h-[min(36rem,100%)] @2xl:grid-cols-[18rem_minmax(0,1fr)] @2xl:grid-rows-1" : "max-w-sm",
      )}
    >
      <div class="flex flex-col gap-6 p-6">
        <div class="flex items-center gap-3">
          <LogoMark class="size-11 shrink-0 text-primary" />
          <div class="min-w-0">
            <h2 class="text-base font-semibold">Updating WebOS</h2>
            <p class="font-mono text-2xs text-foreground/80">
              {[version.info, version.update_available].flatMap((info) => (info ? [`v${info.version}`] : [])).join(" → ")}
            </p>
          </div>
        </div>
        <ol class="flex flex-col gap-2 text-ui" aria-live="polite">
          {#each STEPS as step, index (step.stage)}
            {@const done = index < current}
            {@const active = index === current}
            <li class={cn("flex items-center gap-2.5", !done && !active && "text-foreground/65")}>
              <span class="grid size-4 place-items-center">
                {#if done}<CheckIcon class="size-4 text-primary" weight="bold" />{:else if active}<Spinner label={step.label} class="text-foreground" />{:else}<span class="size-1.5 rounded-full bg-foreground/30"></span>{/if}
              </span>
              {step.label}
            </li>
            {#if active && step.stage === UpdateStage.INSTALLING && progress}
              <li class="flex flex-col gap-1.5 pl-6.5">
                {#if progress.total}
                  <div
                    class="h-1 overflow-hidden rounded-full bg-foreground/12"
                    role="progressbar"
                    aria-label="Downloaded"
                    aria-valuemin={0}
                    aria-valuemax={progress.total}
                    aria-valuenow={Math.min(progress.done, progress.total)}
                  >
                    <div class="h-full rounded-full bg-primary transition-[width] duration-300" style:width="{fraction * 100}%"></div>
                  </div>
                {/if}
                <span class="font-mono text-2xs text-foreground/65 tabular-nums" aria-hidden="true">
                  {progress_line(progress.done, progress.total, Math.max(0, now - progress.started))}
                </span>
              </li>
            {/if}
          {/each}
        </ol>
        {#if progress?.slow && version.update_stage === UpdateStage.INSTALLING}
          <div class="flex flex-col items-start gap-3 @2xl:mt-auto">
            <p class="text-2xs text-pretty text-foreground/80">Still downloading. It finishes on its own, or restart now and WebOS loads the new version straight from the network.</p>
            <Button onclick={() => version.restart_update()}>Restart now</Button>
          </div>
        {/if}
      </div>
      {#if notes.length > 0}
        <section aria-label="What's new" class="flex min-h-0 flex-col overflow-y-auto border-t border-foreground/8 @2xl:border-t-0 @2xl:border-l">
          <h3 class="sticky top-0 bg-background-dark px-6 pt-5 pb-2 text-2xs font-medium tracking-wide text-foreground/65 uppercase">What's new</h3>
          <div class="flex flex-col gap-5 px-6 pb-6">
            {#each notes as note (note.version)}
              <article class="flex flex-col gap-2">
                <header class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h4 class="text-sm font-semibold">{note.title}</h4>
                  <Badge class="font-mono">v{note.version}</Badge>
                </header>
                <ul class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                  {#each note.changes as change, index (index)}
                    <li class="col-span-2 grid grid-cols-subgrid items-baseline text-ui text-pretty">
                      <span><Badge tone={KINDS[change.kind].tone}>{KINDS[change.kind].label}</Badge></span>
                      <span>{change.text}</span>
                    </li>
                  {/each}
                </ul>
              </article>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  </div>
{/if}

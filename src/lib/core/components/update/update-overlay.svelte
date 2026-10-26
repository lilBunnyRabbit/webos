<script lang="ts">
  import kernel, { ChangeKind, UpdateStage, type VersionService } from "$lib/core/api";
  import { progress_line } from "$lib/core/api/services/version/precache";
  import { compare_versions } from "$lib/core/api/services/version/semver";
  import { cn } from "$lib/core/utils";
  import { Check as CheckIcon } from "phosphor-svelte";
  import { fade } from "svelte/transition";
  import { motion_reduced } from "$lib/core/utils/motion";
  import LogoMark from "../brand/logo-mark.svelte";
  import { Button, Spinner } from "../ui";

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

  const NOTES_SHOWN = 5;
  const KIND_DOT: Record<ChangeKind, string> = { [ChangeKind.NEW]: "bg-primary", [ChangeKind.IMPROVED]: "bg-info", [ChangeKind.FIXED]: "bg-success" };
  const notes = $derived((version.update_available?.notes ?? []).filter((note) => compare_versions(note.version, version.info.version) > 0));
  const changes = $derived(notes.flatMap((note) => note.changes));
</script>

<!-- Covers both shells while "Update and reload" runs; it stays up until the page navigates away. -->
{#if version.update_stage !== UpdateStage.IDLE}
  <div
    role="alertdialog"
    aria-modal="true"
    aria-label="Updating WebOS"
    class="fixed inset-0 z-[10000] grid place-items-center bg-background-darkest text-foreground"
    transition:fade={{ duration: motion_reduced() ? 0 : 150 }}
  >
    <div class="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_at_top,var(--background-dark),transparent_70%)]"></div>
    <div class="relative flex max-h-full w-full max-w-sm flex-col items-center gap-6 overflow-y-auto px-6 py-8">
      <LogoMark class="size-16 text-primary" />
      <div class="text-center">
        <h2 class="text-base font-semibold">Updating WebOS</h2>
        <p class="font-mono text-2xs text-foreground/80">
          v{version.info.version}{#if version.update_available}{` → v${version.update_available.version}`}{/if}
        </p>
      </div>
      {#if changes.length > 0}
        <section aria-label="What's new" class="w-full rounded-lg bg-background-dark p-3 ring-1 ring-foreground/8">
          <h3 class="truncate text-2xs font-medium tracking-wide text-foreground/65 uppercase">
            What's new{notes.length === 1 ? ` · ${notes[0].title}` : ""}
          </h3>
          <ul class="mt-2 flex flex-col gap-1.5 text-ui text-pretty">
            {#each changes.slice(0, NOTES_SHOWN) as change, index (index)}
              <li class="flex gap-2">
                <span class={cn("mt-[0.45em] size-1.5 shrink-0 rounded-full", KIND_DOT[change.kind as ChangeKind] ?? "bg-foreground/40")} aria-hidden="true"></span>
                <span class="line-clamp-2">{change.text}</span>
              </li>
            {/each}
          </ul>
          {#if changes.length > NOTES_SHOWN}
            <p class="mt-1.5 pl-3.5 text-2xs text-foreground/65">and {changes.length - NOTES_SHOWN} more in What's new</p>
          {/if}
        </section>
      {/if}
      <ol class="flex w-full flex-col gap-2 text-ui" aria-live="polite">
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
        <div class="flex w-full flex-col items-center gap-3 text-center">
          <p class="text-ui text-pretty text-foreground/80">
            Still downloading… It finishes on its own, or restart now and WebOS loads the new version straight from the network.
          </p>
          <Button onclick={() => version.restart_update()}>Restart now</Button>
        </div>
      {/if}
    </div>
  </div>
{/if}

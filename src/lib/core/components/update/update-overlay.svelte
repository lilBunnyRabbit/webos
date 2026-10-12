<script lang="ts">
  import kernel, { UpdateStage, type VersionService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { Check as CheckIcon } from "phosphor-svelte";
  import { fade } from "svelte/transition";
  import LogoMark from "../brand/logo-mark.svelte";
  import { Spinner } from "../ui";

  const version = $derived(kernel.service<VersionService>("version"));

  const STEPS = [
    { stage: UpdateStage.INSTALLING, label: "Downloading the new version" },
    { stage: UpdateStage.CLEARING, label: "Clearing the old one" },
    { stage: UpdateStage.RELOADING, label: "Restarting" },
  ];

  const current = $derived(STEPS.findIndex((step) => step.stage === version.update_stage));
</script>

<!-- Covers both shells while "Update and reload" runs; it stays up until the page navigates away. -->
{#if version.update_stage !== UpdateStage.IDLE}
  <div
    role="alertdialog"
    aria-modal="true"
    aria-label="Updating WebOS"
    class="fixed inset-0 z-[10000] grid place-items-center bg-background-darkest text-foreground"
    transition:fade={{ duration: 150 }}
  >
    <div class="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_at_top,var(--background-dark),transparent_70%)]"></div>
    <div class="relative flex w-full max-w-xs flex-col items-center gap-6 px-6">
      <LogoMark class="size-16 text-primary" />
      <div class="text-center">
        <h2 class="text-base font-semibold">Updating WebOS</h2>
        <p class="font-mono text-2xs text-foreground/80">
          v{version.info.version}{#if version.update_available}{` → v${version.update_available.version}`}{/if}
        </p>
      </div>
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
        {/each}
      </ol>
    </div>
  </div>
{/if}

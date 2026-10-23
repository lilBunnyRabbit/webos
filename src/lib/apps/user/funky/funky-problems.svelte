<script lang="ts">
  import { EmptyState } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { CheckCircle as CheckCircleIcon, Info as InfoIcon, Warning as WarningIcon, WarningCircle as WarningCircleIcon } from "phosphor-svelte";
  import type { Span } from "./ast";
  import { line_col, Severity, type Diagnostic } from "./diagnostics";

  interface Props {
    diagnostics: Diagnostic[];
    source: string;
    onreveal: (span: Span) => void;
  }

  let { diagnostics, source, onreveal }: Props = $props();

  const ICONS = { [Severity.ERROR]: WarningCircleIcon, [Severity.WARNING]: WarningIcon, [Severity.INFO]: InfoIcon };
  const TONES = { [Severity.ERROR]: "text-error", [Severity.WARNING]: "text-warning", [Severity.INFO]: "text-info" };
  const ORDER = { [Severity.ERROR]: 0, [Severity.WARNING]: 1, [Severity.INFO]: 2 };

  const sorted = $derived([...diagnostics].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (a.span?.from ?? 0) - (b.span?.from ?? 0)));
</script>

<div class="flex flex-col gap-1 p-3">
  {#each sorted as diagnostic, index (index)}
    {@const Icon = ICONS[diagnostic.severity]}
    {@const at = diagnostic.span ? line_col(source, diagnostic.span.from) : null}
    <button
      type="button"
      class="flex items-start gap-2 rounded-md px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none"
      disabled={!diagnostic.span}
      onclick={() => diagnostic.span && onreveal(diagnostic.span)}
    >
      <Icon class={cn("mt-0.5 size-4 shrink-0", TONES[diagnostic.severity])} weight="fill" />
      <span class="min-w-0 flex-1 text-ui">{diagnostic.message}</span>
      {#if at}<span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{at.line}:{at.col}</span>{/if}
    </button>
  {:else}
    <EmptyState icon={CheckCircleIcon} title="No problems" description="The code compiles cleanly." />
  {/each}
</div>

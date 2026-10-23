<script lang="ts">
  import { Badge } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    ArrowSquareOut as ArrowSquareOutIcon,
    CaretRight as CaretRightIcon,
    CheckCircle as CheckCircleIcon,
    Info as InfoIcon,
    Warning as WarningIcon,
    XCircle as XCircleIcon,
  } from "phosphor-svelte";
  import { Severity, type PlatformReport } from "./checks";
  import { PLATFORMS, type Platform } from "./platforms";
  import { PLATFORM_ICONS, verdict } from "./verdict";

  interface Props {
    reports: PlatformReport[];
    notes: string[];
    focus: Platform | null;
  }

  const { reports, notes, focus }: Props = $props();

  const ORDER: Record<Severity, number> = { fail: 0, warn: 1, pass: 2 };
  const ICONS = { fail: XCircleIcon, warn: WarningIcon, pass: CheckCircleIcon };
  const TONES = { fail: "text-error", warn: "text-warning", pass: "text-success" };

  const unfurl = $derived(reports.filter((report) => report.will_unfurl).length);
  const good = $derived(reports.filter((report) => report.looks_good).length);
</script>

<div class="flex flex-col gap-3">
  <p class="text-ui text-foreground/80">
    <span class="font-semibold text-foreground">{good}</span> of {reports.length} look good ·
    <span class="font-semibold text-foreground">{unfurl - good}</span> with warnings ·
    <span class="font-semibold text-foreground">{reports.length - unfurl}</span> won't unfurl
  </p>

  {#if notes.length}
    <div class="flex gap-2 rounded-md bg-info/10 px-3 py-2 text-ui">
      <InfoIcon class="mt-0.5 size-4 shrink-0 text-info" weight="fill" />
      <ul class="flex flex-col gap-1">
        {#each notes as note (note)}<li>{note}</li>{/each}
      </ul>
    </div>
  {/if}

  <div class="flex flex-col gap-2">
    {#each reports as report (report.id)}
      {@const Icon = PLATFORM_ICONS[report.id]}
      {@const result = verdict(report)}
      {@const info = PLATFORMS[report.id]}
      <details class="group rounded-xl bg-background-light shadow-card ring-1 ring-hairline" open={report.id === focus}>
        <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 hover:bg-foreground/4 [&::-webkit-details-marker]:hidden">
          <CaretRightIcon class="size-3.5 shrink-0 text-foreground/65 transition-transform group-open:rotate-90" weight="bold" />
          <span class="grid size-6 shrink-0 place-items-center rounded-md bg-foreground/8 text-foreground/80"><Icon class="size-3.5" weight="bold" /></span>
          <span class="min-w-0 flex-1 truncate text-ui font-medium">{info.name}</span>
          <Badge tone={result.tone}>{result.label}</Badge>
        </summary>
        <ul class="flex flex-col divide-y divide-hairline border-t border-hairline">
          {#each [...report.checks].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]) as check, index (index)}
            {@const SeverityIcon = ICONS[check.severity]}
            <li class="flex gap-2.5 px-3 py-2">
              <SeverityIcon class={cn("mt-0.5 size-4 shrink-0", TONES[check.severity])} weight="fill" />
              <div class="flex min-w-0 flex-col gap-0.5 select-text">
                <span class={cn("text-ui wrap-anywhere", check.severity === Severity.PASS ? "text-foreground/80" : "font-medium")}>{check.title}</span>
                {#if check.detail}<span class="text-ui text-foreground/65">{check.detail}</span>{/if}
                {#if check.fix}
                  <span class="text-ui"><span class="font-medium">Fix:</span> <span class="wrap-anywhere">{check.fix}</span></span>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        <footer class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline px-3 py-2 text-2xs text-foreground/65">
          <span class="font-mono">{info.bot}</span>
          <a class="inline-flex items-center gap-1 text-primary hover:opacity-85" href={info.docs} target="_blank" rel="noopener noreferrer">
            Docs <ArrowSquareOutIcon class="size-3" weight="bold" />
          </a>
        </footer>
      </details>
    {/each}
  </div>
</div>

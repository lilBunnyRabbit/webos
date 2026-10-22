<script lang="ts">
  import kernel, { type VersionService } from "$lib/core/api";
  import { is_settled, is_this_build, PipelineState, type Pipeline } from "$lib/core/api/services/version/pipeline";
  import { button, Button, IconButton, Section } from "$lib/core/components/ui";
  import { cn, error_message, format_datetime } from "$lib/core/utils";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowSquareOut as ArrowSquareOutIcon,
    CheckCircle as CheckCircleIcon,
    Circle as CircleIcon,
    CircleNotch as CircleNotchIcon,
    MinusCircle as MinusCircleIcon,
    XCircle as XCircleIcon,
  } from "phosphor-svelte";

  const version = $derived(kernel.service<VersionService>("version"));

  const POLL = 30_000;
  const LABELS: Record<PipelineState, string> = {
    queued: "Queued",
    running: "Running",
    success: "Passed",
    failure: "Failed",
    cancelled: "Cancelled",
    skipped: "Skipped",
  };
  const ICONS = {
    queued: { icon: CircleIcon, class: "text-foreground/65" },
    running: { icon: CircleNotchIcon, class: "animate-spin text-info" },
    success: { icon: CheckCircleIcon, class: "text-success" },
    failure: { icon: XCircleIcon, class: "text-error" },
    cancelled: { icon: MinusCircleIcon, class: "text-foreground/65" },
    skipped: { icon: MinusCircleIcon, class: "text-foreground/65" },
  } satisfies Record<PipelineState, { icon: unknown; class: string }>;

  let pipeline = $state<Pipeline | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let loaded = $state(false);
  let controller: AbortController | null = null;

  async function load() {
    controller?.abort();
    const current = (controller = new AbortController());
    loading = true;
    try {
      pipeline = await version.pipeline(current.signal);
      error = null;
    } catch (reason) {
      if (current.signal.aborted) return;
      error = navigator.onLine ? error_message(reason) : "You're offline.";
    } finally {
      if (controller === current) {
        loading = false;
        loaded = true;
      }
    }
  }

  $effect(() => {
    void load();
    return () => controller?.abort();
  });

  // Polls only while the run is unfinished and this page is mounted; a settled run stops it.
  $effect(() => {
    if (!pipeline || is_settled(pipeline.state) || loading) return;
    const timer = setTimeout(() => void load(), POLL);
    return () => clearTimeout(timer);
  });

  const relation = $derived.by(() => {
    if (!pipeline) return null;
    if (is_this_build(pipeline, version.info.commit)) return "This build";
    return pipeline.created > version.info.buildTimestamp ? `Newer than this build (v${version.info.version})` : null;
  });
</script>

<Section setting="pipeline" title="Pipeline" description="The newest run of the checks and deploy on GitHub, refreshed every 30 seconds while it runs.">
  <div class="flex flex-col gap-2.5 px-4 py-3" aria-live="polite">
    {#if pipeline}
      {@const run = ICONS[pipeline.state]}
      <div class="flex items-center gap-3">
        <run.icon class={cn("size-5 shrink-0", run.class)} weight="fill" />
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 text-ui font-medium">
            {LABELS[pipeline.state]}
            <span class="font-mono text-2xs text-foreground/65">{pipeline.sha.slice(0, 7)}</span>
          </p>
          <p class="truncate text-2xs text-foreground/80" title={pipeline.title}>{pipeline.title}</p>
        </div>
        <IconButton label="Refresh" size="sm" disabled={loading} onclick={() => void load()}>
          <ArrowClockwiseIcon class={loading ? "animate-spin" : ""} />
        </IconButton>
        <a href={pipeline.url} target="_blank" rel="noopener noreferrer" class={button({ size: "sm" })}>
          Open <ArrowSquareOutIcon class="size-3.5" />
        </a>
      </div>
      <ul class="flex flex-wrap gap-1 pl-8">
        {#each pipeline.jobs as job (job.name)}
          {@const state = ICONS[job.state]}
          <li>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`${job.name}: ${LABELS[job.state]}`}
              class="flex h-6 items-center gap-1.5 rounded-md bg-foreground/6 px-2 text-2xs pointer-coarse:h-8 text-foreground/80 hover:bg-foreground/10 hover:text-foreground"
            >
              <state.icon class={cn("size-3.5", state.class)} weight="fill" />
              {job.name}
            </a>
          </li>
        {/each}
      </ul>
      <p class="pl-8 text-2xs text-foreground/65">
        Started {format_datetime(pipeline.created)}{relation ? ` · ${relation}` : ""}
      </p>
    {:else if error}
      <div class="flex items-center gap-3">
        <p class="min-w-0 flex-1 text-ui text-foreground/80">Couldn't reach GitHub. {error}</p>
        <Button size="sm" disabled={loading} onclick={() => void load()}><ArrowClockwiseIcon /> Retry</Button>
      </div>
    {:else if loaded}
      <p class="text-ui text-foreground/80">No runs yet.</p>
    {:else}
      <p class="flex items-center gap-2 text-ui text-foreground/65"><CircleNotchIcon class="size-4 animate-spin" /> Asking GitHub</p>
    {/if}
  </div>
</Section>

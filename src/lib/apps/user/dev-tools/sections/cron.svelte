<script lang="ts">
  import { Button, CopyButton, Input, Section } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_datetime } from "$lib/core/utils";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import { MAX_RUNS, describe_cron, next_runs, parse_cron } from "../cron";
  import { relative_time } from "../time";
  import type { DevToolsState } from "../tools";

  let { value = $bindable() }: { value: DevToolsState["cron"] } = $props();

  const { window: win } = get_app_context();
  const clock = new Ticker(() => win.is_visible, 60_000);

  const PRESETS = [
    { label: "Every 5 minutes", expression: "*/5 * * * *" },
    { label: "Hourly", expression: "0 * * * *" },
    { label: "Daily 09:00", expression: "0 9 * * *" },
    { label: "Weekdays 09:00", expression: "0 9 * * 1-5" },
    { label: "Monthly", expression: "0 0 1 * *" },
  ];

  const parsed = $derived(value.input.trim() === "" ? null : parse_cron(value.input));
  const now = $derived(clock.now);
  const runs = $derived(parsed?.ok ? next_runs(parsed.schedule, new Date(now), value.count) : []);
</script>

<Section title="Expression" flush>
  <Input bind:value={value.input} aria-label="Cron expression" placeholder="*/15 9-17 * * mon-fri" class="font-mono" />
  <p class="font-mono text-2xs text-foreground/65">minute · hour · day of month · month · day of week</p>
  <div class="flex flex-wrap gap-1.5">
    {#each PRESETS as preset (preset.expression)}
      <Button size="sm" variant="quiet" onclick={() => (value.input = preset.expression)}>{preset.label}</Button>
    {/each}
  </div>
  {#if parsed && !parsed.ok}
    <p role="alert" class="rounded-md bg-error/12 px-3 py-2 text-ui text-error">{parsed.error}</p>
  {:else if parsed?.ok}
    <p class="rounded-xl bg-background-light px-3 py-2 text-sm font-medium ring-1 ring-foreground/8">{describe_cron(parsed.schedule)}</p>
  {:else}
    <p class="text-ui text-foreground/65">Five fields with ranges (1-5), steps (*/15), lists (1,15) and names (mon, jan), or a macro like @daily.</p>
  {/if}
</Section>

{#if parsed?.ok}
  <Section title="Next runs" description="In this device's time zone." flush>
    {#snippet actions()}
      <label class="flex items-center gap-2 text-ui">
        Show
        <Input
          type="number"
          size="sm"
          min={1}
          max={MAX_RUNS}
          class="w-16 font-mono"
          value={value.count}
          onchange={(event) => {
            const count = event.currentTarget.valueAsNumber;
            value.count = Number.isFinite(count) ? Math.min(MAX_RUNS, Math.max(1, Math.floor(count))) : value.count;
          }}
        />
      </label>
    {/snippet}
    {#if runs.length}
      <ol class="max-h-96 divide-y divide-foreground/8 overflow-y-auto rounded-xl bg-background-light ring-1 ring-foreground/8">
        {#each runs as run (run.getTime())}
          <li class="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1 pr-1 pl-3">
            <span class="min-w-0 flex-1 font-mono text-ui tabular-nums">{format_datetime(run)}</span>
            <span class="text-ui text-foreground/65">{relative_time(run.getTime(), now)}</span>
            <CopyButton text={run.toISOString()} label="Copy as ISO" />
          </li>
        {/each}
      </ol>
    {:else}
      <p class="text-ui text-foreground/65">This schedule never runs: no date matches every field.</p>
    {/if}
  </Section>
{/if}

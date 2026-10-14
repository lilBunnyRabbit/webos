<script lang="ts">
  import kernel, { type DialogsService, type WidgetProps, type WindowsService } from "$lib/core/api";
  import ConfirmDialog from "$lib/core/components/dialogs/confirm-dialog.svelte";
  import { IconButton } from "$lib/core/components/ui";
  import { app_data_path, json_file } from "$lib/core/contexts/app/json-file.svelte";
  import { format_datetime } from "$lib/core/utils";
  import { ArrowCounterClockwise, Play } from "phosphor-svelte";
  import { Clock } from "./clock.svelte";
  import Duration from "./duration.svelte";
  import { APP_ID, COUNTERS_FILE, CountersFileSchema, EMPTY_FILE, elapsed_of, format_duration, reset, start, tick_interval, update_counter } from "./counters";

  let { props }: WidgetProps = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const file = json_file(app_data_path(APP_ID, COUNTERS_FILE), EMPTY_FILE, CountersFileSchema);
  $effect(() => () => file.release());

  const counter = $derived(file.value.counters.find((counter) => counter.id === props.counter) ?? null);
  const clock = new Clock(
    () => !windows.page_hidden,
    () => tick_interval(counter ? [elapsed_of(counter, Date.now())] : [])
  );

  async function press() {
    if (!counter) return;
    const id = counter.id;
    if (counter.current_start === null) {
      file.value = update_counter(file.value, id, (c) => start(c, Date.now()));
      return;
    }
    const ok = await dialogs.show(ConfirmDialog, {
      message: `Reset “${counter.name}”?`,
      detail: `This run (${format_duration(elapsed_of(counter, Date.now()))}) goes into its history and the count starts again from zero.`,
      confirm_label: "Reset",
    });
    if (ok) file.value = update_counter(file.value, id, (c) => reset(c, Date.now()));
  }
</script>

{#if counter}
  <div class="@container flex h-full items-center gap-2 px-3">
    <div class="grid min-w-0 flex-1 gap-0.5">
      {#if counter.current_start === null}
        <span class="truncate font-mono text-2xl text-foreground/45 tabular-nums">Stopped</span>
        <span class="truncate text-2xs text-foreground/65">{counter.runs.length} {counter.runs.length === 1 ? "run" : "runs"}</span>
      {:else}
        <Duration ms={clock.now - counter.current_start} class="text-2xl text-primary" />
        <span class="truncate font-mono text-2xs text-foreground/65 tabular-nums">since {format_datetime(counter.current_start)}</span>
      {/if}
    </div>
    <IconButton label={counter.current_start === null ? "Start" : "Reset"} variant="secondary" onclick={press}>
      {#if counter.current_start === null}<Play weight="fill" />{:else}<ArrowCounterClockwise weight="bold" />{/if}
    </IconButton>
  </div>
{:else if file.ready}
  <p class="p-3 text-ui text-foreground/65">This counter is gone. Remove the widget, or add another from Time Since.</p>
{/if}

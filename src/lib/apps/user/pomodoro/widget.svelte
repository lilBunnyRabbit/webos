<script lang="ts">
  import kernel, { type AppsService, type WidgetProps, type WindowsService } from "$lib/core/api";
  import { IconButton, Spinner } from "$lib/core/components/ui";
  import { format_time } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import { ArrowSquareOut, Pause, Play } from "phosphor-svelte";
  import { APP_ID, is_break, PHASE_LABELS, progress, remaining_ms, Status } from "./pomodoro";
  import Ring from "./ring.svelte";
  import { acquire_timer } from "./timer.svelte";

  let {}: WidgetProps = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const { timer, release } = acquire_timer();
  $effect(() => release);

  const run = $derived(timer.run);
  const running = $derived(timer.ready && run.status === Status.RUNNING);
  const ticker = new Ticker(() => running && !windows.page_hidden, 1000);
  const now = $derived(ticker.now);

  const rest = $derived(is_break(run.phase));
</script>

<div class="grid size-full place-items-center p-2 [container-type:size]">
  {#if !timer.ready}
    <Spinner label="Loading the timer" />
  {:else}
    <Ring value={progress(run, timer.settings, now)} {rest} thickness={4} class="size-[min(100cqmin,100%)] [container-type:size]">
      <div class="flex flex-col items-center gap-[3cqi]">
        <span class={cn("text-[max(0.625rem,8cqi)] font-medium tracking-wide uppercase", rest ? "text-success" : "text-primary")}>
          {run.status === Status.PAUSED ? "Paused" : PHASE_LABELS[run.phase]}
        </span>
        <span class="font-mono text-[19cqi] leading-none font-medium tabular-nums" role="timer">{format_time(remaining_ms(run, timer.settings, now))}</span>
        <div class="flex items-center gap-1">
          <IconButton label={running ? "Pause" : "Start"} variant={running ? "secondary" : "primary"} size="sm" onclick={() => (running ? timer.pause() : timer.start())}>
            {#if running}<Pause weight="fill" />{:else}<Play weight="fill" />{/if}
          </IconButton>
          <IconButton label="Open Pomodoro" size="sm" onclick={() => apps.launch(APP_ID)}><ArrowSquareOut /></IconButton>
        </div>
      </div>
    </Ring>
  {/if}
</div>

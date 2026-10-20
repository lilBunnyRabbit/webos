<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { cn, pad2 } from "$lib/core/utils";

  let { vertical }: { vertical: boolean } = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const seconds = $derived(settings.taskbar.seconds);

  let now = $state(new Date());

  $effect(() => {
    // Tick on the minute (or second) boundary so the displayed time never lags behind.
    const step = seconds ? 1000 : 60_000;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      now = new Date();
      timer = setTimeout(tick, step - (Date.now() % step));
    };
    tick();
    return () => clearTimeout(timer);
  });

  // A fixed HH:MM: it fits the vertical dock and reads the same in every locale (docs/design/shell.md). Seconds get their own line there.
  const time = $derived(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
  const date = $derived(now.toLocaleDateString([], vertical ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short" }));
</script>

<time
  datetime={now.toISOString()}
  class={cn("flex shrink-0 flex-col justify-center px-2.5 leading-tight select-none", vertical ? "items-center py-1.5 text-center" : "items-end")}
>
  <span class="font-mono text-ui font-medium tabular-nums">{time}{#if seconds && !vertical}:{pad2(now.getSeconds())}{/if}</span>
  {#if seconds && vertical}<span class="font-mono text-2xs text-foreground/80 tabular-nums">:{pad2(now.getSeconds())}</span>{/if}
  <span class="text-2xs text-foreground/80">{date}</span>
</time>

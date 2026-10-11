<script lang="ts">
  import { cn } from "$lib/core/utils";

  let { vertical }: { vertical: boolean } = $props();

  let now = $state(new Date());

  $effect(() => {
    // Tick on the minute boundary so the displayed time never lags by up to a minute.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      now = new Date();
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    tick();
    return () => clearTimeout(timer);
  });

  // A fixed HH:MM: it fits the vertical dock and reads the same in every locale (docs/design/shell.md).
  const time = $derived(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
  const date = $derived(now.toLocaleDateString([], vertical ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short" }));
</script>

<time
  datetime={now.toISOString()}
  title={now.toLocaleString([], { dateStyle: "full", timeStyle: "short" })}
  class={cn("flex shrink-0 flex-col justify-center rounded-lg px-2.5 leading-tight select-none", vertical ? "items-center py-1.5 text-center" : "items-end")}
>
  <span class="font-mono text-ui font-medium tabular-nums">{time}</span>
  <span class="text-2xs text-foreground/80">{date}</span>
</time>

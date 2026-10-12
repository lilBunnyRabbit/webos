<script lang="ts">
  import { format_bytes } from "$lib/core/utils";
  import { cn } from "$lib/core/utils";
  import type { Route } from "./peer";
  import { Phase } from "./session.svelte";

  let { phase, route, rtt, rate }: { phase: Phase; route: Route | null; rtt: number | null; rate: number } = $props();

  const STATES: Record<Phase, { label: string; dot: string }> = {
    setup: { label: "Idle", dot: "bg-foreground/40" },
    connecting: { label: "Handshake", dot: "bg-warning motion-safe:animate-pulse" },
    transferring: { label: "Link up", dot: "bg-success" },
    interrupted: { label: "Dropped", dot: "bg-error" },
    done: { label: "Closed", dot: "bg-success" },
  };
  const live = $derived(phase === Phase.TRANSFERRING);
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-foreground/8 bg-background-light px-3 py-1.5 font-mono text-2xs text-foreground/80 uppercase tabular-nums" role="status">
  <span class="flex items-center gap-1.5 text-foreground">
    <span class={cn("size-1.5 rounded-full", STATES[phase].dot)}></span>
    {STATES[phase].label}
  </span>
  <span>Route <span class="text-foreground">{live && route ? (route === "lan" ? "LAN" : "WAN·STUN") : "—"}</span></span>
  <span>RTT <span class="text-foreground">{live && rtt !== null ? `${Math.round(rtt * 1000)} ms` : "—"}</span></span>
  <span class="ml-auto">Rate <span class="text-foreground">{live ? `${format_bytes(rate)}/s` : "—"}</span></span>
</div>

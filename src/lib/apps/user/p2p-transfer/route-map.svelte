<script lang="ts">
  import { cn, format_bytes } from "$lib/core/utils";
  import {
    ArrowRight as ArrowRightIcon,
    Cloud as CloudIcon,
    DeviceMobile as DeviceMobileIcon,
    HardDrives as HardDrivesIcon,
    LockSimple as LockSimpleIcon,
    Monitor as MonitorIcon,
  } from "phosphor-svelte";
  import type { LinkStats } from "./peer";
  import { format_endpoint, Phase, tls_name } from "./session.svelte";

  let { role, phase, link }: { role: "send" | "receive"; phase: Phase; link: LinkStats | null } = $props();

  const live = $derived(phase === Phase.TRANSFERRING);
  const known = $derived(!!link?.route);
  const up = $derived(live && known);
  const encryption = $derived(link?.cipher ? `${link.tls_version ? `${tls_name(link.tls_version)} · ` : ""}${link.cipher}` : "DTLS");
</script>

{#snippet node(title: string, Icon: typeof MonitorIcon, endpoint: string, type: string | null | undefined)}
  <div class="flex min-w-0 flex-col items-center gap-1 text-center">
    <div class={cn("grid size-10 place-items-center rounded-xl ring-1 ring-inset transition-colors duration-150", up ? "bg-primary/12 text-primary ring-primary/40" : "bg-foreground/6 text-foreground/65 ring-foreground/10")}>
      <Icon class="size-5" />
    </div>
    <span class="text-ui font-medium">{title}</span>
    <span class="max-w-full truncate font-mono text-2xs text-foreground/80 tabular-nums" title={endpoint}>{endpoint}</span>
    {#if type}<span class="font-mono text-2xs text-foreground/80 uppercase">{type}</span>{/if}
  </div>
{/snippet}

<section class="flex flex-col gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8" aria-label="Where your files go">
  <h2 class="font-mono text-2xs font-medium tracking-wide text-foreground/80 uppercase">Data path</h2>

  <div class="grid grid-cols-[minmax(0,1fr)_minmax(4rem,1.4fr)_minmax(0,1fr)] items-start gap-2">
    {@render node("This device", MonitorIcon, known ? format_endpoint(link!.local) : "—", known ? link?.local?.type : null)}

    <div class="flex flex-col items-center gap-1 pt-2">
      <span class="flex items-center gap-1 font-mono text-2xs font-medium tracking-wide uppercase {up ? 'text-primary' : 'text-foreground/80'}">
        <LockSimpleIcon weight="bold" class="size-3" /> Direct
      </span>
      <div class={cn("flow relative h-0.5 w-full rounded-full", up ? "flow-on text-primary" : "bg-foreground/16", role === "receive" && "flow-reverse")}></div>
      <span class="flex items-center gap-1 font-mono text-2xs text-foreground/80">
        {#if role === "receive"}<ArrowRightIcon weight="bold" class="size-3 rotate-180" />{/if}
        files
        {#if role === "send"}<ArrowRightIcon weight="bold" class="size-3" />{/if}
      </span>
      <span class="max-w-full truncate font-mono text-2xs text-foreground/80" title={encryption}>{encryption}</span>
    </div>

    {@render node("Other device", DeviceMobileIcon, known ? format_endpoint(link!.remote) : "—", known ? link?.remote?.type : null)}
  </div>

  <div class="flex items-start gap-2.5 rounded-lg border border-dashed border-foreground/16 p-2.5">
    <CloudIcon class="mt-0.5 size-4 shrink-0 text-foreground/65" />
    <p class="min-w-0 text-2xs leading-relaxed text-foreground/80">
      <span class="font-mono">stun.l.google.com</span> only tells each device its public address while connecting. It never sees a byte of your files, and there is no WebOS server.
    </p>
  </div>

  <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-2xs tabular-nums">
    {#if role === "receive"}
      <dt class="text-foreground/80 uppercase">Writes to</dt>
      <dd class="flex min-w-0 items-center gap-1 truncate"><HardDrivesIcon class="size-3 shrink-0" /> /tmp/p2p-transfer/*.part → /home/Downloads</dd>
    {:else}
      <dt class="text-foreground/80 uppercase">Reads from</dt>
      <dd class="flex min-w-0 items-center gap-1 truncate"><HardDrivesIcon class="size-3 shrink-0" /> this device, in memory; nothing is uploaded</dd>
    {/if}
    <dt class="text-foreground/80 uppercase">On the wire</dt>
    <dd>↑ {format_bytes(link?.bytes_sent ?? 0)} · ↓ {format_bytes(link?.bytes_received ?? 0)}</dd>
  </dl>
</section>

<style>
  .flow-on {
    background: repeating-linear-gradient(90deg, currentColor 0 6px, transparent 6px 10px);
    background-size: 20px 100%;
    animation: flow 600ms linear infinite;
  }

  .flow-reverse.flow-on {
    animation-direction: reverse;
  }

  @keyframes flow {
    to {
      background-position: 20px 0;
    }
  }
</style>

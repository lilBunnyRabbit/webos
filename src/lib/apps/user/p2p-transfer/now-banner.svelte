<script lang="ts">
  import { cn, format_bytes } from "$lib/core/utils";
  import {
    CheckCircle as CheckCircleIcon,
    CircleNotch as CircleNotchIcon,
    HandPointing as HandPointingIcon,
    Pause as PauseIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { Phase, type ReceiveSession, type SendSession } from "./session.svelte";

  /** One plain sentence about what's happening now, and what the person should do, above everything technical. */
  let {
    role,
    session,
    wake_lock,
  }: { role: "send" | "receive"; session: SendSession | ReceiveSession; wake_lock: boolean } = $props();

  type Tone = "act" | "wait" | "ok" | "warn" | "error";

  const sender = $derived(role === "send" ? (session as SendSession) : null);
  const count = $derived(session.entries.length);
  const files_label = $derived(`${count} file${count === 1 ? "" : "s"}`);

  const now = $derived.by((): { tone: Tone; title: string; detail: string } => {
    const { phase } = session;
    if (phase === Phase.SETUP) {
      return role === "send"
        ? { tone: "act", title: "Pick what to send", detail: "Add files, then tap Generate offer. Open P2P Transfer on the other device and choose Receive." }
        : { tone: "act", title: "Scan the sender's code", detail: "On the other device: Send, add files, Generate offer. Point this camera at the code it shows." };
    }
    if (phase === Phase.CONNECTING) {
      if (!session.code) return { tone: "wait", title: "Preparing your code", detail: "Finding this device's addresses. A few seconds." };
      if (role === "send" && sender?.answered) {
        return { tone: "wait", title: "Connecting", detail: "Both codes are in. The devices are finding each other and setting up encryption." };
      }
      return role === "send"
        ? { tone: "act", title: "Step 1 of 2: show this code to the receiver", detail: "Let the other device scan it. It then shows a code of its own: scan that below." }
        : { tone: "act", title: "Show this code to the sender", detail: "Let the sending device scan it. The transfer starts on its own once it has." };
    }
    if (phase === Phase.INTERRUPTED) {
      return { tone: "error", title: "Transfer stopped", detail: session.error ?? "The connection was lost" };
    }
    if (phase === Phase.DONE) {
      return role === "send"
        ? { tone: "ok", title: "Done", detail: `The receiver saved all ${files_label}. You can close this.` }
        : { tone: "ok", title: "Done", detail: `${files_label} saved to Downloads.` };
    }
    if (session.stalled) {
      return {
        tone: "warn",
        title: "Stalled",
        detail: "Nothing has arrived for 10 s. Is the other device's screen on, with P2P Transfer in front? It picks up again on its own.",
      };
    }
    if (sender?.queued) {
      return { tone: "wait", title: "Waiting for the receiver to confirm", detail: "Everything has left this device. Keep this screen on until it says Done." };
    }
    const left = format_bytes(Math.max(0, session.total - session.done_bytes));
    return role === "send"
      ? { tone: "wait", title: `Sending ${files_label}`, detail: `${left} to go. Keep this screen on until it says Done.` }
      : { tone: "wait", title: `Receiving ${files_label}`, detail: `${left} to go, saving to Downloads. Keep this screen on.` };
  });

  const ICONS = { act: HandPointingIcon, wait: CircleNotchIcon, ok: CheckCircleIcon, warn: PauseIcon, error: WarningCircleIcon };
  const Icon = $derived(ICONS[now.tone]);
</script>

<div
  role="status"
  aria-live="polite"
  class={cn(
    "flex items-start gap-3 rounded-xl p-3 ring-1 ring-inset",
    now.tone === "act" && "bg-primary/12 ring-primary/30",
    now.tone === "wait" && "bg-background-light ring-foreground/8",
    now.tone === "ok" && "bg-success/12 ring-success/30",
    now.tone === "warn" && "bg-warning/12 ring-warning/30",
    now.tone === "error" && "bg-error/12 ring-error/30"
  )}
>
  <Icon
    weight={now.tone === "wait" ? "bold" : "fill"}
    class={cn(
      "mt-0.5 size-5 shrink-0",
      now.tone === "act" && "text-primary",
      now.tone === "wait" && "text-foreground/65 motion-safe:animate-spin",
      now.tone === "ok" && "text-success",
      now.tone === "warn" && "text-warning",
      now.tone === "error" && "text-error"
    )}
  />
  <div class="min-w-0 flex-1">
    <p class="text-sm font-semibold">{now.title}</p>
    <p class="text-ui text-foreground/80">{now.detail}</p>
  </div>
  {#if wake_lock}
    <span class="shrink-0 rounded-sm bg-foreground/8 px-1.5 py-0.5 font-mono text-2xs text-foreground/80 uppercase" title="This screen won't turn off while the transfer runs">Screen on</span>
  {/if}
</div>

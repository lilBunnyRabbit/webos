<script lang="ts">
  import kernel, { type AppsService, type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, IconButton, Segmented, Spinner, Toolbar } from "$lib/core/components/ui";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { format_bytes } from "$lib/core/utils";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    Devices as DevicesIcon,
    DownloadSimple as DownloadSimpleIcon,
    FolderOpen as FolderOpenIcon,
    Lightbulb as LightbulbIcon,
    Plus as PlusIcon,
    QrCode as QrCodeIcon,
    UploadSimple as UploadSimpleIcon,
    WifiHigh as WifiHighIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import BlockBar from "./block-bar.svelte";
  import CodeDisplay from "./code-display.svelte";
  import CodeScanner from "./code-scanner.svelte";
  import EventLog from "./event-log.svelte";
  import Handshake from "./handshake.svelte";
  import LightReceive from "./light-receive.svelte";
  import LightSend from "./light-send.svelte";
  import { LightReceiver, LightSender } from "./light.svelte";
  import LinkStatus from "./link-status.svelte";
  import NowBanner from "./now-banner.svelte";
  import RouteMap from "./route-map.svelte";
  import { NO_PATH, Phase, ReceiveSession, SendSession } from "./session.svelte";
  import Throughput from "./throughput.svelte";

  type Role = "send" | "receive";
  type Mode = "direct" | "light";

  const { window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  let role = $state<Role>("send");
  let mode = $state<Mode>("direct");
  const light_sender = new LightSender();
  const light_receiver = new LightReceiver();
  const sender = new SendSession();
  const receiver = new ReceiveSession();
  const session = $derived(role === "send" ? sender : receiver);
  const busy = $derived(mode === "direct" && (session.phase === Phase.CONNECTING || session.phase === Phase.TRANSFERRING));

  const STEPS: Record<Role, string[]> = {
    send: ["Offer", "Answer", "Channel"],
    receive: ["Scan", "Answer", "Channel"],
  };
  const step = $derived.by(() => {
    const { phase, code } = session;
    if (phase === Phase.SETUP) return role === "send" ? -1 : 0;
    if (phase === Phase.CONNECTING) return role === "send" ? (sender.answered ? 2 : code ? 1 : 0) : 2;
    return 3;
  });

  $effect(() => () => {
    sender.close();
    receiver.close();
  });

  const active = $derived(
    [sender, receiver].some((side) => side.phase === Phase.CONNECTING || side.phase === Phase.TRANSFERRING) ||
      light_sender.running ||
      light_receiver.camera
  );
  let wake_lock = $state(false);

  // A phone whose screen turns off freezes this page, and the transfer with it. The browser drops the lock whenever the
  // page is hidden, so it's taken again each time it comes back.
  $effect(() => {
    if (!active) return;
    let sentinel: WakeLockSentinel | null = null;
    let live = true;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then(
        (lock) => {
          if (!live) return void lock.release();
          sentinel = lock;
          wake_lock = true;
          lock.addEventListener("release", () => (wake_lock = false), { once: true });
        },
        (reason) => console.warn("[P2PTransfer] wake lock refused", reason)
      );
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel?.release();
    };
  });

  async function add_from_files() {
    const path = await win.pick_file({ title: "Send a file" });
    if (!path) return;
    const file = await files.get_file(path);
    if (file) sender.add([file]);
  }

  async function add_from_device() {
    sender.add(await pick_device_files({ multiple: true }));
  }

  function ratio(bytes: number, total: number): number {
    return total === 0 ? 1 : bytes / total;
  }

  function clock(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds)) return "--:--";
    const whole = Math.ceil(seconds);
    return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
  }

  function reset() {
    if (role === "send") sender.reset();
    else receiver.reset();
  }
</script>

<div class="flex h-full flex-col">
  <Toolbar>
    <Segmented
      size="sm"
      label="Role"
      bind:value={role}
      options={[
        { value: "send", label: "Send", icon: UploadSimpleIcon },
        { value: "receive", label: "Receive", icon: DownloadSimpleIcon },
      ]}
    />
    <Segmented
      size="sm"
      label="Mode"
      bind:value={mode}
      options={[
        { value: "direct", label: "Direct", icon: WifiHighIcon },
        { value: "light", label: "By light", icon: LightbulbIcon },
      ]}
    />
    {#if mode === "light" && wake_lock}
      <span class="ml-auto shrink-0 rounded-sm bg-foreground/8 px-1.5 py-0.5 font-mono text-2xs text-foreground/80 uppercase" title="This screen won't turn off while the transfer runs">Screen on</span>
    {/if}
    {#if busy}
      <Button variant="quiet" size="sm" class="ml-auto" onclick={reset}><XIcon weight="bold" /> Cancel</Button>
    {/if}
  </Toolbar>

  {#if mode === "direct"}
    <LinkStatus phase={session.phase} stalled={session.stalled} route={session.link?.route ?? null} rtt={session.link?.rtt ?? null} rate={session.rate} />
  {/if}

  <div class="min-h-0 flex-1 overflow-auto">
    <div class="mx-auto flex max-w-xl flex-col gap-5 p-4 @md:p-6">
      {#if mode === "light"}
        {#if role === "send"}
          <LightSend sender={light_sender} />
        {:else}
          <LightReceive receiver={light_receiver} />
        {/if}
      {:else}
        <NowBanner {role} {session} {wake_lock} />
        <Handshake steps={STEPS[role]} {step} />

        {#if session.phase === Phase.SETUP && role === "send"}
          <section class="flex flex-col rounded-xl bg-background-light shadow-card ring-1 ring-hairline">
            <header class="flex items-baseline justify-between gap-3 border-b border-hairline px-3 py-2 font-mono text-2xs font-medium tracking-wide text-foreground/80 uppercase tabular-nums">
              <span>Manifest</span>
              <span>{sender.files.length} file{sender.files.length === 1 ? "" : "s"} · {format_bytes(sender.total)}</span>
            </header>
            {#each sender.entries as entry, index (index)}
              <div class="flex items-center gap-3 px-3 py-1.5">
                <span class="w-5 shrink-0 font-mono text-2xs text-foreground/80 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <span class="min-w-0 flex-1 truncate text-ui">{entry.name}</span>
                <span class="font-mono text-2xs text-foreground/80 tabular-nums">{format_bytes(entry.size)}</span>
                <IconButton label="Remove" size="sm" onclick={() => sender.remove(index)}><XIcon weight="bold" /></IconButton>
              </div>
            {:else}
              <p class="px-3 py-6 text-center text-ui text-foreground/65">Add the files to send. They're read on this device and go straight to the other one.</p>
            {/each}
            <div class="flex flex-wrap gap-1 border-t border-hairline p-1">
              <Button variant="quiet" size="sm" onclick={add_from_files}><PlusIcon weight="bold" /> Add file…</Button>
              <Button variant="quiet" size="sm" onclick={add_from_device}><DevicesIcon weight="bold" /> From device…</Button>
            </div>
          </section>
          <Button variant="primary" class="self-center" disabled={sender.files.length === 0} onclick={() => sender.offer()}>
            <QrCodeIcon weight="bold" /> Generate offer
          </Button>
        {:else if session.phase === Phase.SETUP}
          <div class="flex flex-col gap-2">
            <p class="text-center text-ui text-foreground/65">On the sending device: open P2P Transfer, add files, generate an offer. Then scan it here.</p>
            <CodeScanner onscan={(code) => receiver.accept(code)} />
          </div>
        {:else if session.phase === Phase.CONNECTING}
          {#if !session.code}
            <div class="flex flex-col items-center gap-3 py-10">
              <Spinner label="Gathering ICE candidates" />
              <p class="font-mono text-2xs text-foreground/80 uppercase">Gathering ICE candidates…</p>
            </div>
          {:else if role === "send"}
            <div class="grid gap-6 @lg:grid-cols-2">
              <div class="flex flex-col gap-2">
                <p class="text-center text-ui text-foreground/65">Scan this on the receiving device</p>
                <CodeDisplay code={session.code} kind="Offer" label="Sender's connection code" />
              </div>
              {#if sender.answered}
                <div class="flex flex-col items-center justify-center gap-3 py-10">
                  <Spinner label="Connecting" />
                  <p class="text-center font-mono text-2xs text-foreground/80 uppercase">Answer accepted · opening the encrypted channel</p>
                </div>
              {:else}
                <div class="flex flex-col gap-2">
                  <p class="text-center text-ui text-foreground/65">Then scan the answer it shows</p>
                  <CodeScanner onscan={(code) => sender.answer(code)} />
                </div>
              {/if}
            </div>
          {:else}
            <div class="flex flex-col items-center gap-3">
              <p class="text-center text-ui text-foreground/65">Scan this on the sending device</p>
              <CodeDisplay code={session.code} kind="Answer" label="Receiver's connection code" />
              <p class="flex items-center gap-2 font-mono text-2xs text-foreground/80 uppercase"><Spinner label="Waiting" /> Waiting for the sender</p>
            </div>
          {/if}
        {:else}
          {@const tone = session.phase === Phase.INTERRUPTED ? "error" : session.phase === Phase.DONE ? "success" : "primary"}
          <section class="flex flex-col gap-3 rounded-xl bg-background-light p-3 shadow-card ring-1 ring-hairline">
            <div class="flex items-end justify-between gap-3">
              <div class="flex flex-col">
                <span class="font-mono text-2xs font-medium tracking-wide text-foreground/80 uppercase">
                  {session.phase === Phase.DONE ? "Complete" : session.phase === Phase.INTERRUPTED ? "Interrupted" : role === "send" ? "Sending" : "Receiving"}
                </span>
                <span class="font-mono text-3xl font-semibold tabular-nums">{(ratio(session.done_bytes, session.total) * 100).toFixed(1)}<span class="text-lg text-foreground/65">%</span></span>
              </div>
              <dl class="grid grid-cols-[auto_auto] gap-x-3 text-right font-mono text-2xs tabular-nums">
                <dt class="text-foreground/80 uppercase">Data</dt>
                <dd>{format_bytes(session.done_bytes)} / {format_bytes(session.total)}</dd>
                <dt class="text-foreground/80 uppercase">Rate</dt>
                <dd>{session.phase === Phase.TRANSFERRING ? `${format_bytes(session.rate)}/s` : "—"}</dd>
                <dt class="text-foreground/80 uppercase">ETA</dt>
                <dd>{session.phase === Phase.TRANSFERRING ? clock(session.eta) : "—"}</dd>
              </dl>
            </div>
            <BlockBar value={ratio(session.done_bytes, session.total)} {tone} class="h-2" />
            <Throughput samples={session.samples} />
          </section>

          {#if session.phase === Phase.INTERRUPTED}
            <div class="flex flex-col gap-2">
              {#if session.error !== NO_PATH}
                <p class="text-center text-ui text-foreground/65">What arrived is kept. Reconnect with new codes and it carries on from there.</p>
              {/if}
              <div class="flex justify-center gap-2">
                <Button size="sm" onclick={reset}>Start over</Button>
                <Button variant="primary" size="sm" onclick={() => (role === "send" ? sender.offer() : receiver.rescan())}>
                  <ArrowCounterClockwiseIcon weight="bold" /> Reconnect
                </Button>
              </div>
            </div>
          {/if}

          <section class="flex flex-col rounded-xl bg-background-light shadow-card ring-1 ring-hairline">
            <header class="border-b border-hairline px-3 py-2 font-mono text-2xs font-medium tracking-wide text-foreground/80 uppercase">Files</header>
            {#each session.entries as entry, index (index)}
              {@const bytes = session.progress[index] ?? 0}
              {@const path = role === "receive" ? receiver.saved_path(entry) : null}
              <div class="flex flex-col gap-1.5 px-3 py-2">
                <div class="flex items-center gap-3">
                  <span class="w-5 shrink-0 font-mono text-2xs text-foreground/80 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                  <span class="min-w-0 flex-1 truncate text-ui">{entry.name}</span>
                  <span class="font-mono text-2xs text-foreground/80 tabular-nums">{format_bytes(bytes)} / {format_bytes(entry.size)}</span>
                  {#if path}
                    <IconButton label="Open {path}" size="sm" onclick={() => apps.open(path)}><FolderOpenIcon weight="bold" /></IconButton>
                  {/if}
                </div>
                <BlockBar value={ratio(bytes, entry.size)} tone={bytes === entry.size ? "success" : tone} />
                {#if path}
                  <span class="truncate font-mono text-2xs text-foreground/80" title={path}>→ {path}</span>
                {/if}
              </div>
            {/each}
          </section>

          {#if session.phase === Phase.DONE}
            <Button class="self-center" onclick={reset}>{role === "send" ? "Send more" : "Receive more"}</Button>
          {/if}
        {/if}

        <RouteMap {role} phase={session.phase} link={session.link} />

        <EventLog lines={session.log} />
      {/if}
    </div>
  </div>
</div>

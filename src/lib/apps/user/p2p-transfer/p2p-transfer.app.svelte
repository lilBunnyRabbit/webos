<script lang="ts">
  import kernel, { type AppsService, type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, IconButton, Section, Segmented, Spinner, Toolbar } from "$lib/core/components/ui";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { format_bytes } from "$lib/core/utils";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    CheckCircle as CheckCircleIcon,
    Devices as DevicesIcon,
    DownloadSimple as DownloadSimpleIcon,
    FolderOpen as FolderOpenIcon,
    Plus as PlusIcon,
    UploadSimple as UploadSimpleIcon,
    WarningCircle as WarningCircleIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import CodeDisplay from "./code-display.svelte";
  import CodeScanner from "./code-scanner.svelte";
  import { Phase, ReceiveSession, SendSession } from "./session.svelte";

  type Role = "send" | "receive";

  const { window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  let role = $state<Role>("send");
  const sender = new SendSession();
  const receiver = new ReceiveSession();
  const session = $derived(role === "send" ? sender : receiver);
  const busy = $derived(session.phase === Phase.CONNECTING || session.phase === Phase.TRANSFERRING);

  $effect(() => () => {
    sender.close();
    receiver.close();
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

  function percent(bytes: number, total: number): number {
    return total === 0 ? 100 : Math.round((bytes / total) * 100);
  }
</script>

<div class="grid h-full grid-rows-[auto_1fr]">
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
    {#if busy}
      <Button variant="quiet" size="sm" class="ml-auto" onclick={() => (role === "send" ? sender.reset() : receiver.reset())}>
        <XIcon weight="bold" /> Cancel
      </Button>
    {/if}
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    <div class="mx-auto flex max-w-xl flex-col gap-6 p-4 @md:p-6">
      {#if session.phase === Phase.SETUP && role === "send"}
        <Section title="Files to send" description="Both devices need this app open. Nothing is uploaded anywhere.">
          {#if sender.files.length === 0}
            <p class="p-3 text-ui text-foreground/65">No files yet.</p>
          {:else}
            {#each sender.entries as entry, index (index)}
              <div class="flex items-center gap-3 p-2">
                <span class="min-w-0 flex-1 truncate text-ui">{entry.name}</span>
                <span class="font-mono text-2xs text-foreground/65 tabular-nums">{format_bytes(entry.size)}</span>
                <IconButton label="Remove" size="sm" onclick={() => sender.remove(index)}><XIcon weight="bold" /></IconButton>
              </div>
            {/each}
          {/if}
          <div class="flex flex-wrap gap-1 p-1">
            <Button variant="quiet" size="sm" onclick={add_from_files}><PlusIcon weight="bold" /> Add file…</Button>
            <Button variant="quiet" size="sm" onclick={add_from_device}><DevicesIcon weight="bold" /> From device…</Button>
          </div>
        </Section>
        <Button variant="primary" class="self-center" disabled={sender.files.length === 0} onclick={() => sender.offer()}>Create code</Button>
      {:else if session.phase === Phase.SETUP}
        <Section title="Scan the sender's code" description="Open P2P Transfer on the sending device, add files and create a code.">
          <div class="p-3"><CodeScanner onscan={(code) => receiver.accept(code)} /></div>
        </Section>
      {:else if session.phase === Phase.CONNECTING}
        {#if !session.code}
          <div class="grid place-items-center py-12"><Spinner label="Preparing a code" /></div>
        {:else if role === "send"}
          <Section title="1. Scan this with the receiving device">
            <div class="p-4"><CodeDisplay code={session.code} label="Sender's connection code" /></div>
          </Section>
          <Section title="2. Scan the code it shows back">
            <div class="p-3"><CodeScanner onscan={(code) => sender.answer(code)} /></div>
          </Section>
        {:else}
          <Section title="Scan this with the sending device">
            <div class="flex flex-col items-center gap-4 p-4">
              <CodeDisplay code={session.code} label="Receiver's connection code" />
              <Spinner label="Waiting for the sender to connect" />
            </div>
          </Section>
        {/if}
      {:else}
        {#if session.phase === Phase.INTERRUPTED}
          <div class="flex items-start gap-3 rounded-lg bg-error/12 p-3">
            <WarningCircleIcon weight="fill" class="size-5 shrink-0 text-error" />
            <div class="min-w-0 flex-1">
              <p class="text-ui font-semibold">Transfer interrupted</p>
              <p class="text-ui text-foreground/65">{session.error}. Reconnect to continue where it stopped.</p>
            </div>
          </div>
        {:else if session.phase === Phase.DONE}
          <div class="flex items-center gap-3 rounded-lg bg-success/12 p-3">
            <CheckCircleIcon weight="fill" class="size-5 shrink-0 text-success" />
            <p class="text-ui font-semibold">{role === "send" ? "All files sent" : "All files saved to Downloads"}</p>
          </div>
        {/if}

        <Section title={role === "send" ? "Sending" : "Receiving"} description="{format_bytes(session.done_bytes)} of {format_bytes(session.total)}">
          {#each session.entries as entry, index (index)}
            {@const bytes = session.progress[index] ?? 0}
            {@const path = role === "receive" ? receiver.saved_path(entry) : null}
            <div class="flex flex-col gap-1.5 p-2">
              <div class="flex items-center gap-3">
                <span class="min-w-0 flex-1 truncate text-ui">{entry.name}</span>
                <span class="font-mono text-2xs text-foreground/65 tabular-nums">{percent(bytes, entry.size)}%</span>
                {#if path}
                  <IconButton label="Open" size="sm" onclick={() => apps.open(path)}><FolderOpenIcon weight="bold" /></IconButton>
                {/if}
              </div>
              <div class="h-1 overflow-hidden rounded-full bg-foreground/12">
                <div class="h-full rounded-full bg-primary transition-[width] duration-300" style:width="{percent(bytes, entry.size)}%"></div>
              </div>
            </div>
          {/each}
        </Section>

        {#if session.phase === Phase.INTERRUPTED}
          <div class="flex justify-center gap-2">
            <Button onclick={() => (role === "send" ? sender.reset() : receiver.reset())}>Start over</Button>
            <Button variant="primary" onclick={() => (role === "send" ? sender.offer() : receiver.rescan())}>
              <ArrowCounterClockwiseIcon weight="bold" /> Reconnect
            </Button>
          </div>
        {:else if session.phase === Phase.DONE}
          <Button class="self-center" onclick={() => (role === "send" ? sender.reset() : receiver.reset())}>
            {role === "send" ? "Send more" : "Receive more"}
          </Button>
        {/if}
      {/if}
    </div>
  </div>
</div>

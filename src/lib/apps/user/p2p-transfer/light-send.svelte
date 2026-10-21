<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, IconButton, Segmented, Spinner } from "$lib/core/components/ui";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { format_bytes } from "$lib/core/utils";
  import { Devices as DevicesIcon, Play as PlayIcon, Plus as PlusIcon, Stop as StopIcon, Sun as SunIcon, X as XIcon } from "phosphor-svelte";
  import LightBeam from "./light-beam.svelte";
  import { SPEEDS, Speed, type LightSender } from "./light.svelte";

  let { sender }: { sender: LightSender } = $props();

  const { window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  const speed = $derived(SPEEDS[sender.speed]);
  const header = $derived(sender.stream?.header ?? null);

  async function add_from_files() {
    const path = await win.pick_file({ title: "Send a file by light" });
    if (!path) return;
    await sender.pick((await files.get_file(path)) ?? undefined);
  }

  async function add_from_device() {
    const [file] = await pick_device_files();
    await sender.pick(file);
  }

  function duration(seconds: number): string {
    const whole = Math.max(1, Math.ceil(seconds));
    if (whole < 60) return `${whole} s`;
    const minutes = Math.floor(whole / 60);
    return whole % 60 === 0 ? `${minutes} min` : `${minutes} min ${whole % 60} s`;
  }

  $effect(() => () => sender.stop());
</script>

{#if sender.running && sender.stream}
  <section class="flex flex-col items-center gap-3">
    <div class="w-full max-w-md">
      <LightBeam stream={sender.stream} fps={speed.fps} version={speed.version} onframe={(shown) => (sender.shown = shown)} />
    </div>
    <dl class="grid grid-cols-3 gap-x-4 text-center font-mono text-2xs tabular-nums">
      <dt class="text-foreground/80 uppercase">Frames</dt>
      <dt class="text-foreground/80 uppercase">Round</dt>
      <dt class="text-foreground/80 uppercase">Speed</dt>
      <dd>{sender.shown}</dd>
      <dd>{Math.floor(sender.shown / sender.stream.round_length) + 1}</dd>
      <dd>{speed.fps} fps</dd>
    </dl>
    <p class="flex max-w-md items-start gap-2 text-ui text-foreground/80">
      <SunIcon weight="bold" class="mt-0.5 size-4 shrink-0" />
      Turn this screen's brightness up. Hold the other phone so the code fills most of its view, and keep going until it says Saved.
    </p>
    <Button variant="primary" onclick={() => sender.stop()}><StopIcon weight="fill" /> Stop</Button>
  </section>
{:else}
  <section class="flex flex-col rounded-xl bg-background-light ring-1 ring-foreground/8">
    <header class="flex items-baseline justify-between gap-3 border-b border-foreground/8 px-3 py-2 font-mono text-2xs font-medium tracking-wide text-foreground/80 uppercase tabular-nums">
      <span>File</span>
      <span>up to 2 MB</span>
    </header>
    {#if sender.file}
      <div class="flex items-center gap-3 px-3 py-1.5">
        <span class="min-w-0 flex-1 truncate text-ui">{sender.file.name}</span>
        <span class="font-mono text-2xs text-foreground/80 tabular-nums">{format_bytes(sender.file.size)}</span>
        <IconButton label="Remove" size="sm" onclick={() => sender.clear()}><XIcon weight="bold" /></IconButton>
      </div>
    {:else}
      <p class="px-3 py-6 text-center text-ui text-foreground/65">One file, sent as a stream of codes the other phone films. No network needed.</p>
    {/if}
    <div class="flex flex-wrap gap-1 border-t border-foreground/8 p-1">
      <Button variant="quiet" size="sm" onclick={add_from_files}><PlusIcon weight="bold" /> {sender.file ? "Other file…" : "Pick file…"}</Button>
      <Button variant="quiet" size="sm" onclick={add_from_device}><DevicesIcon weight="bold" /> From device…</Button>
    </div>
  </section>

  {#if sender.error}
    <p role="alert" class="text-center text-ui text-error">{sender.error}</p>
  {/if}

  <div class="flex flex-col items-center gap-2">
    <Segmented
      label="Speed"
      bind:value={() => sender.speed, (value) => void sender.set_speed(value)}
      options={[
        { value: Speed.STEADY, label: `${SPEEDS.steady.label} · ${SPEEDS.steady.fps} fps` },
        { value: Speed.FAST, label: `${SPEEDS.fast.label} · ${SPEEDS.fast.fps} fps` },
      ]}
    />
    {#if header && sender.estimate_seconds !== null}
      <p class="text-center text-ui text-foreground/80">
        About <strong class="font-semibold">{duration(sender.estimate_seconds)}</strong> if the camera catches most codes · {header.k} block{header.k === 1 ? "" : "s"}{header.compressed ? `, packed to ${format_bytes(header.length)}` : ""}
      </p>
    {:else if sender.file && !sender.error}
      <Spinner label="Preparing" />
    {/if}
  </div>

  <Button variant="primary" class="self-center" disabled={!sender.stream} onclick={() => sender.start()}><PlayIcon weight="fill" /> Start sending</Button>
{/if}

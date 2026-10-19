<script lang="ts">
  import { Button, Spinner } from "$lib/core/components/ui";
  import { ArrowsClockwise as ArrowsClockwiseIcon, QrCode as QrCodeIcon, Scan as ScanIcon, WifiSlash as WifiSlashIcon } from "phosphor-svelte";
  import type { List } from "./data";
  import PairCode from "./pair-code.svelte";
  import PairScanner from "./pair-scanner.svelte";
  import { PairState, type PairSession } from "./sync.svelte";

  let { session, list, onclose }: { session: PairSession; list: List | undefined; onclose: () => void } = $props();

  let joining = $state(false);
  let scanning_answer = $state(false);

  const shared_name = $derived(list?.name ?? "this list");

  function start() {
    if (!list) return;
    joining = false;
    scanning_answer = false;
    void session.start(list.id);
  }

  function cancel() {
    if (session.pairing) session.stop();
    joining = false;
    scanning_answer = false;
    onclose();
  }
</script>

<section aria-label="Share live" class="mx-auto flex min-h-full w-full max-w-md flex-col items-center gap-4 px-4 py-5 text-center">
  {#if session.state === PairState.OFFER && session.code}
    <div>
      <p class="text-sm font-medium">1. Scan this on the other phone</p>
      <p class="text-ui text-foreground/65">In Shopping List there: Share live, then Scan a code.</p>
    </div>
    <PairCode code={session.code} label="Pairing code for “{shared_name}”" />
    <div class="flex w-full flex-col items-center gap-3">
      <p class="text-sm font-medium">2. Then scan the answer it shows</p>
      {#if scanning_answer}
        <PairScanner label="Camera for the answer code" onscan={(code) => session.answer(code)} />
      {:else}
        <Button variant="primary" size="lg" class="w-full max-w-64" onclick={() => (scanning_answer = true)}>
          <ScanIcon weight="bold" /> Scan the answer
        </Button>
      {/if}
    </div>
  {:else if session.state === PairState.OFFER || session.state === PairState.CONNECTING}
    <Spinner label="Connecting" />
    <p class="text-sm">{session.state === PairState.OFFER ? "Making a pairing code…" : "Connecting to the other phone…"}</p>
  {:else if session.state === PairState.ANSWER && session.code}
    <div>
      <p class="text-sm font-medium">Now scan this on the first phone</p>
      <p class="text-ui text-foreground/65">The list opens here as soon as they're linked.</p>
    </div>
    <PairCode code={session.code} label="Answer code" />
    <p class="flex items-center gap-2 text-ui text-foreground/65"><Spinner label="Waiting" /> Waiting for the other phone</p>
  {:else if joining}
    <div>
      <p class="text-sm font-medium">Scan the code on the other phone</p>
      <p class="text-ui text-foreground/65">Its list is added here, or merged if you've shared it before.</p>
    </div>
    <PairScanner label="Camera for the pairing code" onscan={(code) => session.join(code)} />
  {:else}
    <div class="mt-auto grid size-12 place-items-center rounded-xl bg-primary/12 text-primary">
      {#if session.state === PairState.OFFLINE}<WifiSlashIcon class="size-6" weight="duotone" />{:else}<QrCodeIcon class="size-6" weight="duotone" />{/if}
    </div>
    <div class="max-w-80">
      {#if session.state === PairState.OFFLINE}
        <p class="text-sm font-medium">The other phone is offline</p>
        <p class="text-ui text-foreground/65">Pair again to merge what changed on either phone while apart.</p>
      {:else}
        <p class="text-sm font-medium">Share “{shared_name}” live</p>
        <p class="text-ui text-foreground/65">Both phones edit the same list while they're linked. The phones connect directly; nothing goes through a server.</p>
      {/if}
    </div>
    <div class="mt-auto flex w-full max-w-64 flex-col gap-2">
      <Button variant="primary" size="lg" disabled={!list} onclick={start}>
        {#if session.state === PairState.OFFLINE}<ArrowsClockwiseIcon weight="bold" /> Pair again{:else}<QrCodeIcon weight="bold" /> Show my code{/if}
      </Button>
      <Button size="lg" onclick={() => (joining = true)}><ScanIcon weight="bold" /> Scan a code</Button>
    </div>
  {/if}

  {#if session.error}
    <p role="alert" class="max-w-80 text-ui text-error">{session.error}</p>
  {/if}

  <Button variant="quiet" onclick={cancel}>{session.pairing || joining ? "Cancel" : "Back to the list"}</Button>
</section>

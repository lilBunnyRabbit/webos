<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { Button, Input, Spinner, Switch } from "$lib/core/components/ui";
  import type { IconComponent } from "$lib/core/components/ui";
  import { error_message } from "$lib/core/utils";
  import { ArrowLeft as ArrowLeftIcon, Carrot as CarrotIcon, DotsNine as DotsNineIcon, Fingerprint as FingerprintIcon } from "phosphor-svelte";
  import { onMount } from "svelte";
  import CarrotPatch from "./carrot-patch.svelte";
  import { DecryptError } from "./crypto";
  import { passkey_available } from "./passkey";
  import PinPad from "./pin-pad.svelte";
  import { MEADOW, pin_secret, QuickMethod, taps_secret } from "./quick";
  import type { JournalRef } from "./store";
  import { setup_quick, type QuickInput } from "./unlock";

  interface Props {
    journal: JournalRef;
    phrase?: string;
    onsaved: () => void;
    onskip?: () => void;
  }

  let { journal, phrase: known, onsaved, onskip }: Props = $props();

  const files = $derived(kernel.service<FilesService>("files"));

  let passkeys = $state(false);
  let method = $state<QuickMethod | null>(null);
  let first_secret = $state<string | null>(null);
  let secret = $state<string | null>(null);
  let shuffle = $state(false);
  let typed = $state("");
  let busy = $state(false);
  let creating_passkey = $state(false);
  let error = $state<string | null>(null);

  onMount(() => {
    void passkey_available().then((available) => (passkeys = available));
  });

  interface Choice {
    method: QuickMethod;
    icon: IconComponent;
    title: string;
    detail: string;
  }

  const choices = $derived<Choice[]>([
    ...(passkeys ? [{ method: QuickMethod.PASSKEY, icon: FingerprintIcon, title: "Fingerprint or passkey", detail: "Your face, finger or screen lock. Can't be guessed." }] : []),
    { method: QuickMethod.TAPS, icon: CarrotIcon, title: "Carrot patch", detail: "Hop through 6 plants on a meadow." },
    { method: QuickMethod.PIN, icon: DotsNineIcon, title: "PIN", detail: "6 digits, typed or tapped." },
  ]);

  function reset() {
    method = null;
    first_secret = null;
    secret = null;
    shuffle = false;
    typed = "";
    error = null;
  }

  async function save(value: QuickMethod, master: string, entered: string | null) {
    const input: QuickInput =
      value === QuickMethod.PASSKEY
        ? { method: value, label: `Moonrabbit · ${journal.name}` }
        : { method: value, secret: entered ?? "", shuffle: value === QuickMethod.TAPS ? shuffle : undefined };
    busy = true;
    error = null;
    try {
      await setup_quick(files, journal, master, input);
      onsaved();
    } catch (reason) {
      error =
        reason instanceof DecryptError
          ? "That phrase doesn't open this journal."
          : reason instanceof DOMException && reason.name === "NotAllowedError"
            ? "The passkey was cancelled."
            : error_message(reason);
    } finally {
      busy = false;
    }
  }

  async function pick(value: QuickMethod) {
    reset();
    if (value !== QuickMethod.PASSKEY || !known) {
      method = value;
      return;
    }
    creating_passkey = true;
    await save(value, known, null);
    creating_passkey = false;
  }

  function entered(value: string) {
    if (!first_secret) {
      first_secret = value;
      error = null;
    } else if (first_secret === value) {
      secret = value;
      if (method === QuickMethod.PIN && known) void save(method, known, value);
    } else {
      first_secret = null;
      error = "Those didn't match. Start again.";
    }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const master = known ?? typed;
    if (!method || !master || busy) return;
    void save(method, master, secret);
  }

  const asks_secret = $derived(method === QuickMethod.TAPS || method === QuickMethod.PIN);
  const final_form = $derived(method !== null && (!asks_secret || secret !== null) && (!known || method === QuickMethod.TAPS));
</script>

<div class="grid gap-4">
  {#if !method}
    <p class="text-ui text-foreground/65">
      A passkey can't be guessed. A hop path or a PIN only keeps out someone using this browser: with a copy of the whole browser profile they can be guessed in hours. The
      master phrase is still asked every 7 days.
    </p>
    <div class="grid gap-2" role="group" aria-label="Quick unlock method">
      {#each choices as choice (choice.method)}
        {@const Icon = choice.icon}
        <Button size="lg" class="h-auto min-h-16 justify-start gap-3 py-3 text-left whitespace-normal" disabled={busy} onclick={() => pick(choice.method)}>
          <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary [&_svg]:size-5!">
            {#if creating_passkey && choice.method === QuickMethod.PASSKEY}<Spinner label="Waiting for the passkey" />{:else}<Icon weight="duotone" />{/if}
          </span>
          <span class="grid min-w-0 flex-1 gap-0.5">
            <span class="text-sm font-medium">{choice.title}</span>
            <span class="text-ui font-normal text-foreground/65">{choice.detail}</span>
          </span>
        </Button>
      {/each}
    </div>
    {#if onskip}
      <Button variant="quiet" class="justify-self-center" disabled={busy} onclick={onskip}>Not now</Button>
    {/if}
  {:else if asks_secret && secret === null}
    <p class="text-ui text-foreground/65">{first_secret ? "Once more to confirm." : method === QuickMethod.TAPS ? "Hop through 6 plots. The same plot twice is fine." : "Pick 6 digits."}</p>
    <div class="grid justify-items-center">
      {#key first_secret}
        {#if method === QuickMethod.TAPS}
          <CarrotPatch plots={MEADOW} label="Carrot patch" onsubmit={(hops) => entered(taps_secret(hops))} />
        {:else}
          <PinPad label="PIN" onsubmit={(pin) => entered(pin_secret(pin))} />
        {/if}
      {/key}
    </div>
  {:else if final_form}
    <form class="grid gap-3" onsubmit={submit}>
      {#if method === QuickMethod.TAPS}
        <label class="flex items-center justify-between gap-3 text-ui">
          <span>Shuffle the meadow each time<span class="block text-2xs text-foreground/80">The plants move; your path is the same plants. Harder to shoulder-surf.</span></span>
          <Switch bind:checked={shuffle} />
        </label>
      {/if}
      {#if !known}
        <label class="grid gap-1.5">
          <span class="text-ui font-medium">Master phrase</span>
          <Input bind:value={typed} type="password" autocomplete="current-password" spellcheck={false} autocapitalize="off" autofocus />
        </label>
      {/if}
      <Button variant="primary" type="submit" disabled={busy || !(known ?? typed)}>
        {#if busy}<Spinner label="Saving" />{/if}{method === QuickMethod.PASSKEY ? "Create passkey" : "Turn on"}
      </Button>
    </form>
  {:else if busy}
    <Spinner label="Saving" />
  {/if}

  {#if error}<p class="text-ui text-error" role="alert">{error}</p>{/if}

  {#if method}
    <Button variant="quiet" size="sm" class="justify-self-start" disabled={busy} onclick={reset}><ArrowLeftIcon weight="bold" />Another way</Button>
  {/if}
</div>

<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { Button, Input, Select, Spinner } from "$lib/core/components/ui";
  import { error_message } from "$lib/core/utils";
  import { Fingerprint as FingerprintIcon, LockKey as LockKeyIcon, PencilSimple as PencilSimpleIcon, PencilSimpleLine as PencilIcon, Plus as PlusIcon, Trash as TrashIcon } from "phosphor-svelte";
  import { capture } from "./capture";
  import { onMount, untrack } from "svelte";
  import CarrotPatch from "./carrot-patch.svelte";
  import { DecryptError, parse_recovery_code } from "./crypto";
  import { passkey_available } from "./passkey";
  import PinPad from "./pin-pad.svelte";
  import QuickSetup from "./quick-setup.svelte";
  import { MEADOW, pin_secret, QuickGate, QuickMethod, shuffled_meadow, taps_secret, type Plot, type QuickRecord } from "./quick";
  import type { JournalRef } from "./store";
  import { quick_state, QuickClosedError, unlock_phrase, unlock_quick, unlock_recovery, WrongQuickError, type Unlocked } from "./unlock";

  interface Props {
    journals: JournalRef[];
    journal: JournalRef;
    onunlocked: (unlocked: Unlocked, recovered: boolean) => void;
    onselect: (name: string) => void;
    onnew: () => void;
    onrename: () => void;
    ondelete: () => void;
    declined: readonly string[];
    ondecline: (journal_id: string) => void;
  }

  let { journals, journal, onunlocked, onselect, onnew, onrename, ondelete, declined, ondecline }: Props = $props();

  const files = $derived(kernel.service<FilesService>("files"));

  const Mode = { PHRASE: "phrase", RECOVERY: "recovery", QUICK: "quick" } as const;
  type Mode = (typeof Mode)[keyof typeof Mode];

  let mode = $state<Mode>(Mode.PHRASE);
  let quick = $state.raw<QuickRecord | null>(null);
  let has_quick = $state(false);
  let passkeys = $state(false);
  let offer = $state.raw<Unlocked | null>(null);
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let checked = $state(false);
  let phrase = $state("");
  let code = $state("");
  let plots = $state.raw<readonly Plot[]>(MEADOW);
  let added = $state<string | null>(null);

  onMount(() => {
    void passkey_available().then((available) => (passkeys = available));
  });

  async function quick_add() {
    try {
      const result = await capture(files, journals, journal.name);
      if (result) added = `Saved to ${result.ref.name}. It shows up there next time you unlock.`;
    } catch (reason) {
      error = error_message(reason);
    }
  }

  $effect(() => {
    const ref = journal;
    untrack(() => {
      checked = false;
      error = null;
      notice = null;
      phrase = "";
      code = "";
      quick = null;
      has_quick = false;
    });
    let stale = false;
    void quick_state(files, ref)
      .then((state) => {
        if (stale) return;
        has_quick = state !== null;
        if (state?.gate === QuickGate.OPEN) {
          quick = state.record;
          plots = state.record.shuffle ? shuffled_meadow() : MEADOW;
          mode = Mode.QUICK;
        } else {
          if (state) notice = new QuickClosedError(state.gate).message;
          mode = Mode.PHRASE;
        }
      })
      .catch(() => (mode = Mode.PHRASE))
      .finally(() => {
        if (!stale) checked = true;
      });
    return () => (stale = true);
  });

  async function attempt(work: () => Promise<Unlocked>, recovered = false) {
    busy = true;
    error = null;
    try {
      const unlocked = await work();
      if (mode === Mode.PHRASE && !has_quick && !declined.includes(unlocked.ref.header.id)) offer = unlocked;
      else onunlocked(unlocked, recovered);
    } catch (reason) {
      if (reason instanceof DecryptError) error = mode === Mode.RECOVERY ? "That code doesn't open this journal." : "That phrase doesn't open this journal.";
      else if (reason instanceof WrongQuickError) {
        error = reason.message;
        if (reason.left === 0) {
          quick = null;
          has_quick = false;
          mode = Mode.PHRASE;
        }
      } else if (reason instanceof QuickClosedError) {
        notice = reason.message;
        quick = null;
        mode = Mode.PHRASE;
      } else if (reason instanceof DOMException && reason.name === "NotAllowedError") error = "The passkey was cancelled.";
      else error = error_message(reason);
    } finally {
      busy = false;
    }
  }

  function submit_phrase(event: SubmitEvent) {
    event.preventDefault();
    if (!phrase.trim() || busy) return;
    void attempt(() => unlock_phrase(files, journal, phrase));
  }

  async function submit_code(event: SubmitEvent) {
    event.preventDefault();
    const bytes = await parse_recovery_code(code);
    if (!bytes) {
      error = "That code has a typo: it's 28 letters and digits.";
      return;
    }
    void attempt(() => unlock_recovery(files, journal, bytes), true);
  }

  function decline() {
    if (!offer) return;
    ondecline(offer.ref.header.id);
    onunlocked(offer, false);
  }

  const options = $derived(journals.map((item) => ({ value: item.name, label: item.name })));
  const method_label = $derived(
    quick?.method === QuickMethod.PASSKEY ? "passkey" : quick?.method === QuickMethod.TAPS ? "hop path" : quick?.method === QuickMethod.PIN ? "PIN" : ""
  );
</script>

<div class="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center gap-5 px-4 py-8">
  {#if offer}
    {@const unlocked = offer}
    <div class="grid w-full gap-4">
      <header class="grid gap-1">
        <h1 class="text-lg font-semibold">Faster unlock on this device</h1>
        <p class="text-ui text-foreground/65">Next time, open {unlocked.ref.name} here without typing the phrase. It stays in this browser and never goes into backups.</p>
      </header>
      <QuickSetup journal={unlocked.ref} {phrase} onsaved={() => onunlocked(unlocked, false)} onskip={decline} />
    </div>
  {:else}
    <div class="grid justify-items-center gap-2 text-center">
      <span class="grid size-12 place-items-center rounded-xl bg-primary/12 text-primary"><LockKeyIcon class="size-6" weight="duotone" /></span>
      <h1 class="text-lg font-semibold">{journal.name} is locked</h1>
      {#if journals.length > 1}
        <Select size="sm" value={journal.name} {options} aria-label="Journal" class="w-auto" onchange={(event) => onselect(event.currentTarget.value)} />
      {/if}
    </div>

    {#if notice}<p class="rounded-lg bg-info/10 px-3 py-2 text-center text-ui text-foreground/80">{notice}</p>{/if}

    {#if !checked}
      <Spinner label="Checking this device" />
    {:else if mode === Mode.QUICK && quick}
      {#snippet instead()}
        <Button variant="quiet" size="sm" onclick={() => ((mode = Mode.PHRASE), (error = null))}>Use phrase instead</Button>
      {/snippet}
      {#if quick.method === QuickMethod.PASSKEY}
        <div class="grid justify-items-center gap-2">
          <Button variant="primary" size="lg" disabled={busy} onclick={() => attempt(() => unlock_quick(files, journal, null))}>
            {#if busy}<Spinner label="Waiting for the passkey" />{:else}<FingerprintIcon weight="bold" />{/if}Unlock with passkey
          </Button>
          {@render instead()}
        </div>
      {:else}
        <div class="flex flex-wrap items-center justify-center gap-x-2">
          <p class="text-ui text-foreground/65">{quick.method === QuickMethod.TAPS ? "Hop through the carrot patch" : "Enter your PIN"}</p>
          {@render instead()}
        </div>
        {#if quick.method === QuickMethod.TAPS}
          <CarrotPatch {plots} {busy} label="Carrot patch" onsubmit={(hops) => attempt(() => unlock_quick(files, journal, taps_secret(hops)))} />
        {:else}
          <PinPad {busy} label="PIN" onsubmit={(pin) => attempt(() => unlock_quick(files, journal, pin_secret(pin)))} />
        {/if}
        {#if busy}<Spinner label="Unlocking" />{/if}
      {/if}
    {:else if mode === Mode.RECOVERY}
      <form class="grid w-full gap-2" onsubmit={submit_code}>
        <label class="grid gap-1.5">
          <span class="text-ui font-medium">Recovery code</span>
          <Input bind:value={code} autocomplete="off" spellcheck={false} autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" class="font-mono" autofocus />
        </label>
        <Button variant="primary" type="submit" disabled={busy || !code.trim()}>{#if busy}<Spinner label="Unlocking" />{/if}Unlock</Button>
      </form>
    {:else}
      <form class="grid w-full gap-2" onsubmit={submit_phrase}>
        <label class="grid gap-1.5">
          <span class="text-ui font-medium">Master phrase</span>
          <Input bind:value={phrase} type="password" autocomplete="current-password" spellcheck={false} autocapitalize="off" autofocus />
        </label>
        <Button variant="primary" type="submit" disabled={busy || !phrase.trim()}>{#if busy}<Spinner label="Unlocking" />{/if}Unlock</Button>
        {#if !has_quick}
          <p class="text-center text-ui text-foreground/65">
            Set up {passkeys ? "a fingerprint, a hop path or a PIN" : "a hop path or a PIN"}
            {journal.header && declined.includes(journal.header.id) ? "in Settings › Quick unlock" : "after unlocking"}.
          </p>
        {/if}
      </form>
    {/if}

    {#if error}<p class="text-center text-ui text-error" role="alert">{error}</p>{/if}

    <div class="flex flex-wrap justify-center gap-1">
      {#if mode === Mode.RECOVERY}
        <Button variant="quiet" size="sm" onclick={() => ((mode = Mode.PHRASE), (error = null))}>Use master phrase</Button>
      {/if}
      {#if mode !== Mode.QUICK && quick}
        <Button variant="quiet" size="sm" onclick={() => ((mode = Mode.QUICK), (error = null))}>Use {method_label}</Button>
      {/if}
      {#if mode !== Mode.RECOVERY}
        <Button variant="quiet" size="sm" onclick={() => ((mode = Mode.RECOVERY), (error = null))}>Use recovery code</Button>
      {/if}
      <Button variant="quiet" size="sm" onclick={onnew}><PlusIcon weight="bold" />New journal</Button>
    </div>

    {#if journal.header}
      <div class="grid w-full justify-items-center gap-1.5 border-t border-foreground/8 pt-4">
        <Button onclick={quick_add}><PencilIcon weight="bold" />Add a quick line</Button>
        <p class="text-center text-2xs text-foreground/80" aria-live="polite">{added ?? "Without unlocking: it's encrypted for this journal and only opens with it."}</p>
      </div>
    {/if}

    <div class="flex flex-wrap justify-center gap-1">
      <Button variant="quiet" size="sm" onclick={onrename}><PencilSimpleIcon weight="bold" />Rename</Button>
      <Button variant="quiet" size="sm" onclick={ondelete}><TrashIcon weight="bold" />Delete journal</Button>
    </div>
  {/if}
</div>

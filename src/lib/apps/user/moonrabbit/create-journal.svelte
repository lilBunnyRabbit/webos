<script lang="ts">
  import { Button, Checkbox, CopyButton, IconButton, Input, Spinner } from "$lib/core/components/ui";
  import { escape_html, error_message, format_date } from "$lib/core/utils";
  import { print_html } from "$lib/core/utils/print";
  import { ArrowLeft as ArrowLeftIcon, ArrowsClockwise as ArrowsClockwiseIcon, Printer as PrinterIcon } from "phosphor-svelte";
  import { onMount } from "svelte";
  import { clean_journal_name } from "./journal";
  import { generate_phrase, load_wordlist, phrase_bits, strength_of, Strength } from "./passphrase";
  import StrengthMeter from "./strength-meter.svelte";
  import { new_recovery } from "./unlock";

  interface Props {
    first: boolean;
    oncreate: (name: string, phrase: string, recovery: Uint8Array<ArrayBuffer>) => Promise<void>;
    oncancel?: () => void;
  }

  let { first, oncreate, oncancel }: Props = $props();

  let words = $state.raw<string[]>([]);
  const wordset = $derived(new Set(words));
  let name = $state("Journal");
  let generated = $state("");
  let own = $state(false);
  let typed = $state("");
  let step = $state<"phrase" | "store">("phrase");
  let stored = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let recovery = $state.raw<{ bytes: Uint8Array<ArrayBuffer>; code: string } | null>(null);

  const phrase = $derived(own ? typed : generated);
  const bits = $derived(phrase.trim() ? phrase_bits(phrase, wordset) : 0);
  const clean_name = $derived(clean_journal_name(name));
  const ready = $derived(clean_name !== null && phrase.trim().length > 0 && strength_of(bits) !== Strength.WEAK);

  onMount(() => {
    void load_wordlist().then((list) => {
      words = list;
      generated = generate_phrase(list);
    });
  });

  function reroll() {
    generated = generate_phrase(words);
  }

  async function next() {
    if (!ready) return;
    const fresh = new_recovery();
    recovery = { bytes: fresh.bytes, code: await fresh.code };
    stored = false;
    step = "store";
  }

  function print_code() {
    if (!recovery) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Moonrabbit recovery code</title><style>
body{font:11pt/1.5 system-ui,sans-serif;color:#111;max-width:36rem;margin:2rem auto;padding:0 1rem}
code{display:block;font:600 18pt/1.4 ui-monospace,monospace;letter-spacing:.06em;border:1px solid #999;border-radius:8px;padding:1rem;margin:1rem 0;text-align:center}
</style></head><body><h1>Moonrabbit recovery code</h1><p>Journal: <strong>${escape_html(clean_name ?? "")}</strong> · made ${escape_html(format_date(Date.now()))}</p>
<code>${escape_html(recovery.code)}</code><p>This code opens the journal if you forget your master phrase. Keep it somewhere safe and away from the device. Anyone with it and a copy of the journal can read it.</p></body></html>`;
    void print_html(html, { title: "Moonrabbit recovery code" });
  }

  async function create() {
    if (!recovery || !clean_name || !stored) return;
    busy = true;
    error = null;
    try {
      await oncreate(clean_name, phrase, recovery.bytes);
    } catch (reason) {
      error = error_message(reason);
      busy = false;
    }
  }
</script>

<div class="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-6 @md:px-6">
  {#if step === "phrase"}
    <header class="grid gap-1">
      <h1 class="text-lg font-semibold">{first ? "Start your journal" : "New journal"}</h1>
      <p class="text-ui text-foreground/65">
        Everything you write is encrypted on this device. Only your master phrase or your recovery code opens it, and nobody can reset them for you.
      </p>
    </header>

    <label class="grid gap-1.5">
      <span class="text-ui font-medium">Name</span>
      <Input bind:value={name} maxlength={60} aria-invalid={clean_name === null} />
    </label>

    <section class="grid gap-2.5" aria-labelledby="phrase-title">
      <div class="flex items-center gap-2">
        <h2 id="phrase-title" class="min-w-0 flex-1 text-ui font-medium">Master phrase</h2>
        <Button variant="quiet" size="sm" pressed={own} onclick={() => (own = !own)}>Use my own</Button>
      </div>
      {#if own}
        <Input bind:value={typed} autocomplete="new-password" spellcheck={false} autocapitalize="off" placeholder="Several words you'll remember" aria-label="Your own master phrase" />
      {:else}
        <div class="flex items-center gap-2 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8">
          {#if generated}
            <p class="min-w-0 flex-1 font-mono text-base leading-relaxed break-words" aria-live="polite">{generated}</p>
            <IconButton label="Another phrase" onclick={reroll}><ArrowsClockwiseIcon weight="bold" /></IconButton>
            <CopyButton text={generated} label="Copy phrase" />
          {:else}
            <Spinner label="Picking words" />
          {/if}
        </div>
      {/if}
      <StrengthMeter {bits} />
      {#if !own}
        <p class="text-ui text-foreground/65">Five random words from a list of 7,776. Write them down or remember them; re-roll until you like one.</p>
      {/if}
    </section>

    <div class="flex flex-wrap justify-end gap-2">
      {#if oncancel}<Button variant="quiet" onclick={oncancel}>Cancel</Button>{/if}
      <Button variant="primary" disabled={!ready} onclick={next}>Continue</Button>
    </div>
  {:else if recovery}
    <header class="grid gap-1">
      <h1 class="text-lg font-semibold">Store these somewhere safe</h1>
      <p class="text-ui text-foreground/65">If you forget your phrase, the recovery code is the only way back in. This is the only time it's shown.</p>
    </header>

    <div class="grid gap-3">
      <div class="grid gap-1.5">
        <span class="text-2xs tracking-wide text-foreground/80 uppercase">Master phrase</span>
        <div class="flex items-center gap-2 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8">
          <p class="min-w-0 flex-1 font-mono text-base break-words">{phrase}</p>
          <CopyButton text={phrase} label="Copy phrase" />
        </div>
      </div>
      <div class="grid gap-1.5">
        <span class="text-2xs tracking-wide text-foreground/80 uppercase">Recovery code</span>
        <div class="flex items-center gap-2 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8">
          <p class="min-w-0 flex-1 font-mono text-base tracking-wide break-all">{recovery.code}</p>
          <CopyButton text={recovery.code} label="Copy recovery code" />
          <IconButton label="Print recovery code" onclick={print_code}><PrinterIcon weight="bold" /></IconButton>
        </div>
      </div>
    </div>

    <label class="flex items-start gap-2.5 text-ui">
      <Checkbox bind:checked={stored} class="mt-0.5" />
      <span>I stored my phrase and recovery code where I'll find them, away from this device.</span>
    </label>

    {#if error}<p class="text-ui text-error" role="alert">{error}</p>{/if}

    <div class="flex flex-wrap justify-end gap-2">
      <Button variant="quiet" disabled={busy} onclick={() => (step = "phrase")}><ArrowLeftIcon weight="bold" />Back</Button>
      <Button variant="primary" disabled={!stored || busy} onclick={create}>
        {#if busy}<Spinner label="Encrypting" />{/if}Create journal
      </Button>
    </div>
  {/if}
</div>

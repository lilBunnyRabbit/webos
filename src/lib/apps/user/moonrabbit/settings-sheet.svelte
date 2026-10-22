<script lang="ts">
  import kernel, { type FilesService, type NotificationsService, type SchedulerService } from "$lib/core/api";
  import { JobKind } from "$lib/core/api/services/scheduler";
  import { Button, CopyButton, Input, Section, Select, SettingRow, Spinner, Switch } from "$lib/core/components/ui";
  import { error_message } from "$lib/core/utils";
  import { report_error } from "$kit/utils/report-error";
  import { day_key } from "$lib/core/utils/date";
  import { local_zone } from "$lib/core/utils/zoned";
  import { ArrowLeft as ArrowLeftIcon, Fingerprint as FingerprintIcon, Carrot as CarrotIcon, DotsNine as DotsNineIcon } from "phosphor-svelte";
  import { onMount } from "svelte";
  import CarrotPatch from "./carrot-patch.svelte";
  import { DecryptError, parse_recovery_code } from "./crypto";
  import { APP_ID } from "./journal";
  import { load_wordlist, phrase_bits, strength_of, Strength } from "./passphrase";
  import { passkey_available } from "./passkey";
  import PinPad from "./pin-pad.svelte";
  import { MEADOW, pin_secret, QuickGate, QuickMethod, taps_secret, type Plot, type QuickRecord } from "./quick";
  import type { JournalSession } from "./session.svelte";
  import Sheet from "./sheet.svelte";
  import StrengthMeter from "./strength-meter.svelte";
  import { change_phrase, quick_state, regenerate_recovery, remove_quick, setup_quick, type MasterSecret } from "./unlock";

  interface Props {
    session: JournalSession;
    idle_minutes: number;
    hidden_seconds: number;
    onclose: () => void;
  }

  let { session, idle_minutes = $bindable(), hidden_seconds = $bindable(), onclose }: Props = $props();

  const files = $derived(kernel.service<FilesService>("files"));
  const scheduler = $derived(kernel.service<SchedulerService>("scheduler"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const Page = { MAIN: "main", QUICK: "quick", PHRASE: "phrase", RECOVERY: "recovery" } as const;
  type Page = (typeof Page)[keyof typeof Page];

  let page = $state<Page>(Page.MAIN);
  let quick = $state.raw<{ record: QuickRecord; gate: QuickGate } | null>(null);
  let passkeys = $state(false);
  let wordset = $state.raw<ReadonlySet<string>>(new Set());
  let error = $state<string | null>(null);
  let busy = $state(false);

  let method = $state<QuickMethod | null>(null);
  let first_secret = $state<string | null>(null);
  let secret = $state<string | null>(null);
  let shuffle = $state(false);
  let phrase = $state("");

  let use_recovery = $state(false);
  let current = $state("");
  let next_phrase = $state("");
  let new_code = $state<string | null>(null);

  const next_bits = $derived(next_phrase.trim() ? phrase_bits(next_phrase, wordset) : 0);

  async function refresh() {
    quick = await quick_state(files, session.ref);
  }

  onMount(() => {
    void refresh();
    void passkey_available().then((available) => (passkeys = available));
    void load_wordlist().then((list) => (wordset = new Set(list)));
  });

  function go(next: Page) {
    page = next;
    error = null;
    busy = false;
    method = null;
    first_secret = null;
    secret = null;
    shuffle = false;
    phrase = "";
    current = "";
    next_phrase = "";
    use_recovery = false;
    new_code = null;
  }

  function entered(value: string) {
    if (!first_secret) {
      first_secret = value;
      error = null;
    } else if (first_secret === value) secret = value;
    else {
      first_secret = null;
      error = "Those didn't match. Start again.";
    }
  }

  async function run(work: () => Promise<void>) {
    busy = true;
    error = null;
    try {
      await work();
    } catch (reason) {
      error =
        reason instanceof DecryptError
          ? use_recovery
            ? "That recovery code doesn't open this journal."
            : "That phrase doesn't open this journal."
          : reason instanceof DOMException && reason.name === "NotAllowedError"
            ? "The passkey was cancelled."
            : error_message(reason);
    } finally {
      busy = false;
    }
  }

  function save_quick(event: SubmitEvent) {
    event.preventDefault();
    if (!method || !phrase) return;
    const input =
      method === QuickMethod.PASSKEY
        ? { method, label: `Moonrabbit · ${session.ref.name}` }
        : { method, secret: secret ?? "", shuffle: method === QuickMethod.TAPS ? shuffle : undefined };
    void run(async () => {
      await setup_quick(files, session.ref, phrase, input);
      await refresh();
      go(Page.MAIN);
    });
  }

  async function forget_quick() {
    await remove_quick(session.id);
    await refresh();
  }

  async function master(): Promise<MasterSecret> {
    if (!use_recovery) return { phrase: current };
    const bytes = await parse_recovery_code(current);
    if (!bytes) throw new Error("That code has a typo: it's 28 letters and digits.");
    return { recovery: bytes };
  }

  function save_phrase(event: SubmitEvent) {
    event.preventDefault();
    void run(async () => {
      session.set_ref(await change_phrase(files, session.ref, await master(), next_phrase));
      await refresh();
      go(Page.MAIN);
      notifications.notify(APP_ID, { title: "Master phrase changed" });
    });
  }

  function save_recovery(event: SubmitEvent) {
    event.preventDefault();
    void run(async () => {
      const { ref, code } = await regenerate_recovery(files, session.ref, await master());
      session.set_ref(ref);
      new_code = code;
    });
  }

  const JOB_ID = `${APP_ID}:reminder`;
  const job = $derived(scheduler.get(JOB_ID));
  const reminder_time = $derived(job && "time" in job.at ? job.at.time : "21:00");

  async function set_reminder(on: boolean, time = reminder_time) {
    try {
      if (!on) {
        await scheduler.cancel(JOB_ID);
        return;
      }
      void notifications.request_system();
      await scheduler.schedule(APP_ID, { key: "reminder", title: "Time to write", at: { date: day_key(), time, tz: local_zone() }, repeat: { every: "day" }, kind: JobKind.REMINDER });
    } catch (reason) {
      report_error(APP_ID, "Couldn't change the reminder", reason);
    }
  }

  const METHOD_LABELS: Record<QuickMethod, string> = { passkey: "Passkey", taps: "Carrot patch", pin: "PIN" };
  const quick_detail = $derived(
    !quick
      ? "Not set up. The master phrase is always needed."
      : quick.gate === QuickGate.OPEN
        ? `${METHOD_LABELS[quick.record.method]} on this device. The master phrase is still asked every 7 days.`
        : `${METHOD_LABELS[quick.record.method]}, paused until you unlock with the master phrase.`
  );
  const plots: readonly Plot[] = MEADOW;
</script>

<Sheet title={page === Page.MAIN ? "Journal settings" : page === Page.QUICK ? "Quick unlock" : page === Page.PHRASE ? "Change master phrase" : "New recovery code"} {onclose}>
  {#if page === Page.MAIN}
    <div class="grid gap-6">
      <Section title="Quick unlock" description="A faster way in on this device only. It never leaves this browser or goes into backups.">
        <SettingRow label="This device" description={quick_detail}>
          {#snippet children({ id, describedby })}
            <div class="flex gap-2">
              {#if quick}<Button variant="danger" size="sm" onclick={forget_quick}>Remove</Button>{/if}
              <Button {id} aria-describedby={describedby} size="sm" onclick={() => go(Page.QUICK)}>{quick ? "Change" : "Set up"}</Button>
            </div>
          {/snippet}
        </SettingRow>
      </Section>

      <Section title="Auto-lock" description="The journal locks itself and forgets everything it decrypted.">
        <SettingRow label="When idle">
          {#snippet children({ id, describedby })}
            <Select
              {id}
              aria-describedby={describedby}
              size="sm"
              class="w-auto"
              bind:value={() => String(idle_minutes), (value) => (idle_minutes = Number(value))}
              options={[
                { value: "1", label: "After 1 minute" },
                { value: "5", label: "After 5 minutes" },
                { value: "15", label: "After 15 minutes" },
                { value: "30", label: "After 30 minutes" },
                { value: "0", label: "Never" },
              ]}
            />
          {/snippet}
        </SettingRow>
        <SettingRow label="When hidden" description="Minimized, another app on top on a phone, or the tab in the background.">
          {#snippet children({ id, describedby })}
            <Select
              {id}
              aria-describedby={describedby}
              size="sm"
              class="w-auto"
              bind:value={() => String(hidden_seconds), (value) => (hidden_seconds = Number(value))}
              options={[
                { value: "0", label: "Right away" },
                { value: "60", label: "After 1 minute" },
                { value: "300", label: "After 5 minutes" },
              ]}
            />
          {/snippet}
        </SettingRow>
      </Section>

      <Section title="Reminder" description="One notification a day. It only says “Time to write”.">
        <SettingRow label="Daily reminder">
          {#snippet children({ id, describedby })}
            <div class="flex items-center gap-2">
              {#if job}
                <Input type="time" size="sm" class="w-auto font-mono" aria-label="Reminder time" value={reminder_time} onchange={(event) => event.currentTarget.value && set_reminder(true, event.currentTarget.value)} />
              {/if}
              <Switch {id} aria-describedby={describedby} checked={job !== undefined} onchange={(event) => set_reminder(event.currentTarget.checked)} />
            </div>
          {/snippet}
        </SettingRow>
      </Section>

      <Section title="Master phrase and recovery code" description="Changing either rewraps the journal's key; entries aren't re-encrypted.">
        <SettingRow label="Master phrase">
          {#snippet children({ id, describedby })}
            <Button {id} aria-describedby={describedby} size="sm" onclick={() => go(Page.PHRASE)}>Change…</Button>
          {/snippet}
        </SettingRow>
        <SettingRow label="Recovery code" description="The old code stops working.">
          {#snippet children({ id, describedby })}
            <Button {id} aria-describedby={describedby} size="sm" onclick={() => go(Page.RECOVERY)}>New code…</Button>
          {/snippet}
        </SettingRow>
      </Section>
    </div>
  {:else}
    <div class="grid gap-4">
      <Button variant="quiet" size="sm" class="justify-self-start" onclick={() => go(Page.MAIN)}><ArrowLeftIcon weight="bold" />Settings</Button>

      {#if page === Page.QUICK}
        {#if !method}
          <p class="text-ui text-foreground/65">
            A passkey can't be guessed. A hop path or a PIN only keeps out someone using this browser: with a copy of the whole browser profile they can be guessed in hours.
          </p>
          <div class="grid gap-2">
            {#if passkeys}
              <Button size="lg" class="justify-start" onclick={() => (method = QuickMethod.PASSKEY)}><FingerprintIcon weight="bold" />Passkey or fingerprint</Button>
            {/if}
            <Button size="lg" class="justify-start" onclick={() => (method = QuickMethod.TAPS)}><CarrotIcon weight="bold" />Carrot patch: 6 hops on a meadow</Button>
            <Button size="lg" class="justify-start" onclick={() => (method = QuickMethod.PIN)}><DotsNineIcon weight="bold" />6-digit PIN</Button>
          </div>
        {:else if method !== QuickMethod.PASSKEY && !secret}
          <p class="text-ui text-foreground/65">{first_secret ? "Once more to confirm." : method === QuickMethod.TAPS ? "Hop through 6 plots. The same plot twice is fine." : "Pick 6 digits."}</p>
          <div class="grid justify-items-center">
            {#key first_secret}
              {#if method === QuickMethod.TAPS}
                <CarrotPatch {plots} label="Carrot patch" onsubmit={(hops) => entered(taps_secret(hops))} />
              {:else}
                <PinPad label="PIN" onsubmit={(pin) => entered(pin_secret(pin))} />
              {/if}
            {/key}
          </div>
        {:else}
          <form class="grid gap-3" onsubmit={save_quick}>
            {#if method === QuickMethod.TAPS}
              <label class="flex items-center justify-between gap-3 text-ui">
                <span>Shuffle the meadow each time<span class="block text-2xs text-foreground/80">The plants move; your path is the same plants. Harder to shoulder-surf.</span></span>
                <Switch bind:checked={shuffle} />
              </label>
            {/if}
            <label class="grid gap-1.5">
              <span class="text-ui font-medium">Master phrase</span>
              <Input bind:value={phrase} type="password" autocomplete="current-password" spellcheck={false} autocapitalize="off" autofocus />
            </label>
            <Button variant="primary" type="submit" disabled={busy || !phrase}>
              {#if busy}<Spinner label="Saving" />{/if}{method === QuickMethod.PASSKEY ? "Create passkey" : "Turn on"}
            </Button>
          </form>
        {/if}
      {:else if page === Page.PHRASE}
        <form class="grid gap-3" onsubmit={save_phrase}>
          <label class="grid gap-1.5">
            <span class="text-ui font-medium">{use_recovery ? "Recovery code" : "Current phrase"}</span>
            <Input bind:value={current} type={use_recovery ? "text" : "password"} autocomplete="off" spellcheck={false} autocapitalize="off" class={use_recovery ? "font-mono" : undefined} autofocus />
          </label>
          <Button variant="quiet" size="sm" class="justify-self-start" onclick={() => ((use_recovery = !use_recovery), (current = ""))}>
            {use_recovery ? "Use the current phrase" : "Forgot it? Use the recovery code"}
          </Button>
          <label class="grid gap-1.5">
            <span class="text-ui font-medium">New phrase</span>
            <Input bind:value={next_phrase} autocomplete="new-password" spellcheck={false} autocapitalize="off" />
          </label>
          <StrengthMeter bits={next_bits} />
          <Button variant="primary" type="submit" disabled={busy || !current || strength_of(next_bits) === Strength.WEAK}>
            {#if busy}<Spinner label="Saving" />{/if}Change phrase
          </Button>
        </form>
      {:else if new_code}
        <p class="text-ui text-foreground/65">Your new recovery code. Store it now; it isn't shown again and the old one no longer works.</p>
        <div class="flex items-center gap-2 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8">
          <p class="min-w-0 flex-1 font-mono text-base tracking-wide break-all">{new_code}</p>
          <CopyButton text={new_code} label="Copy recovery code" />
        </div>
        <Button variant="primary" onclick={() => go(Page.MAIN)}>Done</Button>
      {:else}
        <form class="grid gap-3" onsubmit={save_recovery}>
          <label class="grid gap-1.5">
            <span class="text-ui font-medium">{use_recovery ? "Current recovery code" : "Master phrase"}</span>
            <Input bind:value={current} type={use_recovery ? "text" : "password"} autocomplete="off" spellcheck={false} autocapitalize="off" class={use_recovery ? "font-mono" : undefined} autofocus />
          </label>
          <Button variant="quiet" size="sm" class="justify-self-start" onclick={() => ((use_recovery = !use_recovery), (current = ""))}>
            {use_recovery ? "Use the master phrase" : "Use the current recovery code"}
          </Button>
          <Button variant="primary" type="submit" disabled={busy || !current}>{#if busy}<Spinner label="Saving" />{/if}Make a new code</Button>
        </form>
      {/if}

      {#if error}<p class="text-ui text-error" role="alert">{error}</p>{/if}
    </div>
  {/if}
</Sheet>

<script lang="ts">
  import kernel, { Platform, type FilesService, type SchedulerService } from "$lib/core/api";
  import { Button, EmptyState, Spinner } from "$lib/core/components/ui";
  import { Warning as WarningIcon } from "phosphor-svelte";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_date } from "$lib/core/utils";
  import { day_key } from "$lib/core/utils/date";
  import { report_error } from "$kit/utils/report-error";
  import { onDestroy, untrack } from "svelte";
  import { z } from "zod";
  import CreateJournal from "./create-journal.svelte";
  import { APP_ID, JOURNAL_ROOT } from "./journal";
  import JournalView from "./journal-view.svelte";
  import { ask_delete, ask_rename } from "./manage";
  import { lock_journal } from "./sessions";
  import { JournalSession } from "./session.svelte";
  import { list_journals, type JournalRef } from "./store";
  import { create_journal, delete_journal, rename_journal, type Unlocked } from "./unlock";
  import UnlockView from "./unlock-view.svelte";

  const { window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const scheduler = $derived(kernel.service<SchedulerService>("scheduler"));
  const mobile = kernel.platform === Platform.MOBILE;

  const last_journal = storage.persisted<string | null>("journal", null, z.string().nullable());
  const idle_minutes = storage.persisted("idle-minutes", 5, z.number().int().min(0).max(120));
  const quick_declined = storage.persisted<string[]>("quick-offer-declined", [], z.array(z.string()));
  const hidden_seconds = storage.persisted("hidden-seconds", mobile ? 0 : 60, z.number().int().min(0).max(3600));

  let journals = $state.raw<JournalRef[]>([]);
  let loaded = $state(false);
  let creating = $state(false);
  let session = $state.raw<JournalSession | null>(null);
  let recovered = $state(false);
  let entry_date = $state<string | null>(null);
  let last_activity = Date.now();

  function reload(): Promise<void> {
    return list_journals(files)
      .then((list) => void (journals = list))
      .catch((reason) => report_error(APP_ID, "Couldn't list your journals", reason))
      .finally(() => (loaded = true));
  }

  $effect(() => {
    files.revision("/home");
    files.revision(JOURNAL_ROOT);
    untrack(reload);
  });

  const selected = $derived(journals.find((journal) => journal.name === last_journal.value) ?? journals[0] ?? null);

  function open(unlocked: Unlocked, from_recovery: boolean) {
    session?.lock();
    const next = new JournalSession(() => files, unlocked.ref, unlocked.key, () => {
      if (session === next) session = null;
    });
    recovered = from_recovery;
    last_activity = Date.now();
    last_journal.value = unlocked.ref.name;
    session = next;
  }

  async function create(name: string, phrase: string, recovery: Uint8Array<ArrayBuffer>): Promise<Unlocked> {
    creating = true;
    const unlocked = await create_journal(files, name, phrase, recovery);
    await reload();
    return unlocked;
  }

  function created(unlocked: Unlocked) {
    creating = false;
    open(unlocked, false);
  }

  function lock() {
    session?.lock();
  }

  function switch_to(name: string) {
    lock();
    last_journal.value = name;
  }

  async function rename(ref: JournalRef) {
    const name = await ask_rename(win, ref.name, journals);
    if (!name) return;
    const id = ref.header?.id;
    const own = session && session.id === id ? session : null;
    try {
      if (id) lock_journal(id, own ?? undefined);
      if (own) own.set_ref(await rename_journal(files, own.ref, name));
      else await rename_journal(files, ref, name);
      if (last_journal.value === ref.name) last_journal.value = name;
      await reload();
    } catch (reason) {
      report_error(APP_ID, "Couldn't rename the journal", reason);
    }
  }

  async function remove(ref: JournalRef) {
    if (!(await ask_delete(win, ref.name))) return;
    const id = ref.header?.id;
    try {
      if (id) lock_journal(id);
      await delete_journal(files, scheduler, ref);
      if (id) quick_declined.value = quick_declined.value.filter((declined) => declined !== id);
      if (last_journal.value === ref.name) last_journal.value = null;
      await reload();
    } catch (reason) {
      report_error(APP_ID, "Couldn't delete the journal", reason);
    }
  }

  onDestroy(lock);

  $effect(() => {
    const date = entry_date ?? day_key();
    const [year, month, day] = date.split("-").map(Number);
    win.set_title(session ? format_date(new Date(year, month - 1, day)) : "Moonrabbit · locked");
  });

  $effect(() => {
    if (!session || idle_minutes.value === 0) return;
    const limit = idle_minutes.value * 60_000;
    const timer = setInterval(() => {
      if (Date.now() - last_activity >= limit) lock();
    }, 5_000);
    return () => clearInterval(timer);
  });

  $effect(() => {
    if (!session || win.is_visible || session.picking > 0) return;
    if (hidden_seconds.value === 0) {
      lock();
      return;
    }
    const timer = setTimeout(lock, hidden_seconds.value * 1000);
    return () => clearTimeout(timer);
  });

  function active() {
    last_activity = Date.now();
  }
</script>

<div class="@container h-full overflow-auto bg-background" onpointerdowncapture={active} onkeydowncapture={active} oninputcapture={active} onwheelcapture={active} role="presentation">
  {#if !loaded}
    <div class="grid h-full place-items-center"><Spinner label="Looking for journals" /></div>
  {:else if session}
    <JournalView
      {session}
      {journals}
      {recovered}
      bind:idle_minutes={idle_minutes.value}
      bind:hidden_seconds={hidden_seconds.value}
      onlock={lock}
      onswitch={switch_to}
      onnew={() => {
        lock();
        creating = true;
      }}
      onrename={() => session && rename(session.ref)}
      ondelete={() => session && remove(session.ref)}
      onerror={(title, reason) => report_error(APP_ID, title, reason)}
      ontitle={(date) => (entry_date = date)}
    />
  {:else if creating || !selected}
    <CreateJournal first={journals.length === 0} oncreate={create} onfinish={created} oncancel={journals.length ? () => (creating = false) : undefined} />
  {:else if !selected.header}
    <EmptyState icon={WarningIcon} tone="error" title="This journal can't be opened" description={`${selected.path}/journal.json is damaged. Without it the entries can't be decrypted; restore it from a backup.`} class="h-full">
      {#snippet actions()}
        <Button variant="danger" onclick={() => remove(selected)}>Delete journal…</Button>
      {/snippet}
    </EmptyState>
  {:else}
    {#key selected.path}
      <UnlockView
        {journals}
        journal={selected}
        declined={quick_declined.value}
        onunlocked={open}
        onselect={(name) => (last_journal.value = name)}
        onnew={() => (creating = true)}
        onrename={() => rename(selected)}
        ondelete={() => remove(selected)}
        ondecline={(id) => (quick_declined.value = [...quick_declined.value, id])}
      />
    {/key}
  {/if}
</div>

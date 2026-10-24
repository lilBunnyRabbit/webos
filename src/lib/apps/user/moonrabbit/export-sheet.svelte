<script lang="ts">
  import kernel, { type FilesService, type NotificationsService } from "$lib/core/api";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { Button, Input, Spinner } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { day_key } from "$lib/core/utils/date";
  import { print_html } from "$lib/core/utils/print";
  import { FileMd as FileMdIcon, Printer as PrinterIcon, Warning as WarningIcon } from "phosphor-svelte";
  import { to_base64 } from "./crypto";
  import { export_html, export_markdown, in_range, type ExportInput } from "./export";
  import { APP_ID, media_of } from "./journal";
  import { media_type, type JournalSession } from "./session.svelte";
  import Sheet from "./sheet.svelte";

  interface Props {
    session: JournalSession;
    onclose: () => void;
    onerror: (title: string, reason: unknown) => void;
  }

  let { session, onclose, onerror }: Props = $props();

  const { window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const today = day_key();
  let from = $state(`${today.slice(0, 8)}01`);
  let to = $state(today);
  let busy = $state(false);

  const count = $derived(session.index.filter((meta) => meta.date >= from && meta.date <= to).length);

  async function gather(): Promise<ExportInput> {
    const entries = in_range(await session.all_entries(), from, to);
    const media = new Map<string, string>();
    for (const id of entries.flatMap((entry) => media_of(entry.body))) {
      if (media.has(id)) continue;
      const bytes = await session.media_bytes(id);
      media.set(id, `data:${media_type(bytes)};base64,${to_base64(bytes)}`);
    }
    return { title: session.ref.name, from, to, entries, media, activities: new Map(session.activities.map((activity) => [activity.id, activity.label])) };
  }

  async function save_markdown() {
    busy = true;
    try {
      const input = await gather();
      const path = await win.pick_save({ name: `${session.ref.name} ${from} to ${to}.md`, accept: [".md"], title: "Export as Markdown" });
      if (!path) return;
      const folder = await files.get_directory(parent_path(path));
      if (!folder) throw new Error(`${parent_path(path)} is gone`);
      await files.create_file(folder, base_name(path), { overwrite: true, content: export_markdown(input) });
      notifications.notify(APP_ID, { title: "Exported", message: `${input.entries.length} entries to ${path}. That file isn't encrypted.` });
      onclose();
    } catch (reason) {
      onerror("Couldn't export", reason);
    } finally {
      busy = false;
    }
  }

  async function print() {
    busy = true;
    try {
      await print_html(export_html(await gather()), { title: `${session.ref.name} ${from} to ${to}` });
    } catch (reason) {
      onerror("Couldn't print", reason);
    } finally {
      busy = false;
    }
  }
</script>

<Sheet title="Export" {onclose}>
  <div class="grid gap-4">
    <div class="grid grid-cols-2 gap-3">
      <label class="grid gap-1.5">
        <span class="text-ui font-medium">From</span>
        <Input type="date" class="font-mono" bind:value={from} max={to} />
      </label>
      <label class="grid gap-1.5">
        <span class="text-ui font-medium">To</span>
        <Input type="date" class="font-mono" bind:value={to} min={from} />
      </label>
    </div>
    <p class="text-ui text-foreground/65">{count} {count === 1 ? "entry" : "entries"} in this range.</p>
    <p class="flex gap-2 rounded-lg bg-warning/10 px-3 py-2 text-ui text-foreground/80">
      <WarningIcon class="mt-0.5 size-4 shrink-0 text-warning" weight="fill" />
      <span>Exports are plain text and pictures. Anyone who opens the file or the printout can read them.</span>
    </p>
  </div>
  {#snippet footer()}
    {#if busy}<Spinner label="Decrypting" class="self-center" />{/if}
    <Button disabled={busy || count === 0} onclick={print}><PrinterIcon weight="bold" />Print or PDF</Button>
    <Button variant="primary" disabled={busy || count === 0} onclick={save_markdown}><FileMdIcon weight="bold" />Save Markdown…</Button>
  {/snippet}
</Sheet>

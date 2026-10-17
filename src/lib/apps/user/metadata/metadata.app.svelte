<script lang="ts">
  import kernel, { NotificationType, type FilesService, type NotificationsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, Checkbox, EmptyState, IconButton, Section, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn, error_message, format_bytes } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import {
    ArrowSquareOut as ArrowSquareOutIcon,
    Binary as BinaryIcon,
    Broom as BroomIcon,
    Devices as DevicesIcon,
    FileMagnifyingGlass as FileMagnifyingGlassIcon,
    FolderOpen as FolderOpenIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { APP_ID, open_in_hex, strip_beside, write_at } from "./files";
  import { inspect, type Inspection } from "./inspect";
  import { strip_metadata, stripped_name } from "./strip";

  const ACCEPT = ["image/jpeg", "image/png", "image/webp", ".jpg", ".jpeg", ".png", ".webp", ".pdf", "application/pdf"];

  const { path }: { path?: string } = $props();
  const { window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  let file = $state.raw<File | null>(null);
  let source = $state<string | null>(null);
  let found = $state.raw<Inspection | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let keep_orientation = $state(true);
  let saving = $state(false);
  let dragging = $state(false);
  let root: HTMLDivElement | null = $state(null);

  const can_strip = $derived(found !== null && found.format !== "pdf");
  let token = 0;

  async function load(next: File, at: string | null) {
    const mine = ++token;
    loading = true;
    error = null;
    try {
      const result = await inspect(new Uint8Array(await next.arrayBuffer()), next.name);
      if (mine !== token) return;
      file = next;
      source = at;
      found = result;
    } catch (reason) {
      if (mine !== token) return;
      file = null;
      found = null;
      error = error_message(reason);
    } finally {
      if (mine === token) loading = false;
    }
  }

  async function open_path(target: string) {
    const opened = await files.get_file(target).catch(() => null);
    if (opened) return load(opened, target);
    found = null;
    error = `File not found: ${target}`;
  }

  async function pick() {
    const chosen = await win.pick_file({ title: "Open in Metadata", accept: ACCEPT });
    if (chosen) await open_path(chosen);
  }

  async function pick_device() {
    const [picked] = await pick_device_files({ accept: ACCEPT });
    if (picked) await load(picked, null);
  }

  const initial = untrack(() => path);
  if (initial) void open_path(initial);

  $effect(() => win.set_title(file?.name ?? null));

  async function strip() {
    if (!file || saving) return;
    saving = true;
    try {
      let target: string;
      let removed: number;
      if (source) ({ path: target, removed } = await strip_beside(source, keep_orientation));
      else {
        const chosen = await win.pick_save({ title: "Save the clean copy", name: stripped_name(file.name), accept: ACCEPT });
        if (!chosen) return;
        const result = strip_metadata(new Uint8Array(await file.arrayBuffer()), { keep_orientation });
        await write_at(chosen, result.bytes);
        [target, removed] = [chosen, result.removed];
      }
      notifications.notify(APP_ID, {
        title: removed === 1 ? "Removed 1 metadata block" : `Removed ${removed} metadata blocks`,
        message: target,
        actions: [{ label: "Open", on_click: () => void open_path(target) }],
      });
    } catch (reason) {
      notifications.notify(APP_ID, { type: NotificationType.ERROR, title: "Couldn't strip the metadata", message: error_message(reason) });
    } finally {
      saving = false;
    }
  }

  function on_drop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    const dropped = event.dataTransfer?.files[0];
    if (dropped) void load(dropped, null);
  }

  function on_dragover(event: DragEvent) {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    dragging = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!root?.contains(event.relatedTarget as Node | null)) dragging = false;
  }
</script>

{#snippet open_actions()}
  <Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button>
  <Button onclick={pick_device}><DevicesIcon weight="bold" /> From device…</Button>
{/snippet}

<div
  bind:this={root}
  role="presentation"
  class={cn("relative h-full", dragging && "ring-2 ring-primary ring-inset")}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  {#if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't read the file" description={error} actions={open_actions} />
  {:else if !found || !file}
    {#if !loading}
      <EmptyState
        icon={FileMagnifyingGlassIcon}
        title="No file open"
        description="Open a JPEG, PNG, WebP or PDF to see what it says about itself. You can also drop one here."
        actions={open_actions}
      />
    {/if}
  {:else}
    <div class="grid h-full grid-rows-[auto_1fr_auto]">
      <Toolbar>
        <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
        <IconButton label="Open from device…" size="sm" onclick={pick_device}><DevicesIcon weight="bold" /></IconButton>
        <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">{file.name}</span>
        {#if source}
          <IconButton label="Raw bytes in Hex Viewer" size="sm" onclick={() => open_in_hex(source!)}><BinaryIcon weight="bold" /></IconButton>
        {/if}
        {#if can_strip}
          {#if found.orientation !== 1}
            <label class="flex items-center gap-1.5 px-1 text-ui">
              <Checkbox bind:checked={keep_orientation} />
              Keep orientation
            </label>
          {/if}
          <Button
            size="sm"
            variant="primary"
            disabled={found.removable === 0 || saving}
            title={found.removable === 0 ? "Nothing to strip" : source ? "Saves a copy next to the original" : "Saves a copy where you choose"}
            onclick={strip}
          >
            <BroomIcon weight="bold" /> Strip & save
          </Button>
        {/if}
      </Toolbar>

      <div class="min-h-0 overflow-auto">
        <div class="mx-auto flex max-w-3xl flex-col gap-5 p-3 @sm:p-5">
          {#each found.groups as group (group.title)}
            <Section title={group.title} flush>
              <dl class="divide-y divide-foreground/8 rounded-xl bg-background-light ring-1 ring-foreground/8">
                {#each group.rows as row, index (index)}
                  <div class="grid gap-x-4 gap-y-0.5 px-4 py-2 @sm:grid-cols-[min(11rem,35%)_1fr] @sm:items-baseline">
                    <dt class="text-2xs text-foreground/65 @sm:text-ui">{row.label}</dt>
                    <dd class="flex min-w-0 items-baseline gap-2 text-ui select-text">
                      <span class="min-w-0 break-words">{row.value}</span>
                      {#if row.href}
                        <a class="inline-flex shrink-0 items-center gap-1 text-primary hover:opacity-85" href={row.href} target="_blank" rel="noopener noreferrer">
                          Map <ArrowSquareOutIcon class="size-3.5" weight="bold" />
                        </a>
                      {/if}
                      {#if row.offset !== undefined && source}
                        <button type="button" class="shrink-0 text-primary hover:opacity-85" onclick={() => open_in_hex(source!, row.offset)}>Hex</button>
                      {/if}
                    </dd>
                  </div>
                {/each}
              </dl>
            </Section>
          {/each}
        </div>
      </div>

      <StatusBar>
        <span>{found.format.toUpperCase()}</span>
        <span>{format_bytes(file.size)}</span>
        {#if can_strip}<span>{found.removable === 0 ? "No metadata to strip" : `${found.removable} to strip`}</span>{/if}
      </StatusBar>
    </div>
  {/if}

  {#if loading && !found}
    <div class="absolute inset-0 grid place-items-center bg-background"><Spinner label="Reading the file" /></div>
  {/if}
</div>

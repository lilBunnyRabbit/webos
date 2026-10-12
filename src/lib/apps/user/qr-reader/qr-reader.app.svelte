<script lang="ts">
  import kernel, { NotificationType, type ClipboardService, type FilesService, type NotificationsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, EmptyState, IconButton, Section, Toolbar, button } from "$lib/core/components/ui";
  import { cn, format_datetime } from "$lib/core/utils";
  import {
    ArrowSquareOut as ArrowSquareOutIcon,
    Camera as CameraIcon,
    CameraSlash as CameraSlashIcon,
    Check as CheckIcon,
    Copy as CopyIcon,
    ImageSquare as ImageSquareIcon,
    QrCode as QrCodeIcon,
    Trash as TrashIcon,
    Warning as WarningIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { QrEntries, create_qr_detector, detect_qr, is_url, thumbnail, type BarcodeDetector, type QrEntry } from "./qr";

  const { path }: { path?: string } = $props();
  const { window, storage, app_id } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));

  const detector_ready = create_qr_detector();
  let detector = $state.raw<BarcodeDetector | null>(null);
  let detector_error = $state<string | null>(null);
  detector_ready.then(
    (result) => (detector = result),
    (reason) => (detector_error = reason instanceof Error ? reason.message : String(reason))
  );
  const entries = storage.persisted<QrEntry[]>("entries", [], QrEntries);

  let stream = $state.raw<MediaStream | null>(null);
  let starting = $state(false);
  let video: HTMLVideoElement | null = $state(null);
  let dragging = $state(false);
  let destroyed = false;

  let copied_id = $state<string | null>(null);
  let copied_timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => () => {
    destroyed = true;
    clearTimeout(copied_timer);
  });

  function report(title: string, reason?: unknown, type: NotificationType = NotificationType.ERROR) {
    if (reason instanceof Error) console.error(`[QrReader] ${title}`, reason);
    const message = reason === undefined ? undefined : reason instanceof Error ? reason.message : String(reason);
    notifications.notify(app_id, { type, title, message });
  }

  function add_entry(content: string, image_url: string) {
    entries.value = [{ id: crypto.randomUUID(), content, image_url, scanned_at: Date.now() }, ...entries.value];
  }

  async function scan_file(file: File) {
    if (!file.type.startsWith("image/")) return report("Not an image", file.name, NotificationType.WARNING);
    let bitmap: ImageBitmap | undefined;
    try {
      const ready = await detector_ready;
      bitmap = await createImageBitmap(file);
      const content = await detect_qr(ready, bitmap);
      if (!content) return report("No QR code found in the image", file.name, NotificationType.WARNING);
      add_entry(content, thumbnail(bitmap, bitmap.width, bitmap.height));
    } catch (reason) {
      report("Couldn't read the image", reason);
    } finally {
      bitmap?.close();
    }
  }

  async function open_path(target: string) {
    try {
      const file = await files.get_file(target);
      if (file) await scan_file(file);
      else report("File not found", target);
    } catch (reason) {
      report("Couldn't read the file", reason);
    }
  }

  async function pick() {
    const chosen = await window.pick_file({ accept: ["image/*"], title: "Scan an image" });
    if (chosen) await open_path(chosen);
  }

  const initial_path = untrack(() => path);
  if (initial_path) void open_path(initial_path);

  async function start_camera() {
    starting = true;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (destroyed) media.getTracks().forEach((track) => track.stop());
      else stream = media;
    } catch (reason) {
      report("Couldn't start the camera", reason);
    } finally {
      starting = false;
    }
  }

  function stop_camera() {
    stream = null;
  }

  $effect(() => {
    const current = stream;
    if (!current) return;
    return () => current.getTracks().forEach((track) => track.stop());
  });

  $effect(() => {
    if (!stream || !video || !detector) return;
    const element = video;
    const reader = detector;
    element.srcObject = stream;
    element.play().catch((reason) => console.warn("[QrReader] camera preview failed to play", reason));

    let active = true;
    let handle = 0;
    const scan = async () => {
      const content = await detect_qr(reader, element).catch(() => null);
      if (!active) return;
      if (content) {
        add_entry(content, thumbnail(element, element.videoWidth, element.videoHeight));
        stop_camera();
        return;
      }
      handle = element.requestVideoFrameCallback(scan);
    };
    handle = element.requestVideoFrameCallback(scan);

    return () => {
      active = false;
      element.cancelVideoFrameCallback(handle);
      element.srcObject = null;
    };
  });

  async function copy(entry: QrEntry) {
    try {
      await clipboard.copy_text(entry.content);
    } catch (reason) {
      return report("Couldn't copy to the clipboard", reason);
    }
    copied_id = entry.id;
    clearTimeout(copied_timer);
    copied_timer = setTimeout(() => (copied_id = null), 1200);
  }

  function remove(id: string) {
    entries.value = entries.value.filter((entry) => entry.id !== id);
  }

  async function clear_all() {
    const count = entries.value.length;
    const confirmed = await window.confirm(`Clear ${count === 1 ? "1 scanned code" : `${count} scanned codes`}?`, {
      detail: "The history and its thumbnails are deleted.",
      confirm_label: "Clear",
      danger: true,
    });
    if (confirmed) entries.value = [];
  }

  function scan_first(list: File[]) {
    const file = list.find((item) => item.type.startsWith("image/")) ?? list[0];
    if (file) void scan_file(file);
  }

  function on_paste(event: ClipboardEvent) {
    const pasted = [...(event.clipboardData?.files ?? [])];
    if (!pasted.length) return;
    event.preventDefault();
    scan_first(pasted);
  }

  function on_drop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    scan_first([...(event.dataTransfer?.files ?? [])]);
  }

  function on_dragover(event: DragEvent) {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    dragging = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!(event.currentTarget as Node).contains(event.relatedTarget as Node | null)) dragging = false;
  }
</script>

{#if detector_error}
  <EmptyState icon={WarningIcon} tone="error" title="QR scanning isn't available" description={detector_error} />
{:else}
  <div
    role="presentation"
    tabindex="-1"
    class={cn("grid h-full grid-rows-[auto_1fr] outline-none", dragging && "ring-2 ring-primary ring-inset")}
    onpaste={on_paste}
    ondragover={on_dragover}
    ondragleave={on_dragleave}
    ondrop={on_drop}
  >
    <Toolbar>
      <Button variant="quiet" size="sm" onclick={pick}><ImageSquareIcon weight="bold" /> Open image…</Button>
      {#if stream}
        <Button variant="quiet" size="sm" onclick={stop_camera}><CameraSlashIcon weight="bold" /> Stop camera</Button>
      {:else}
        <Button variant="quiet" size="sm" disabled={starting} onclick={start_camera}><CameraIcon weight="bold" /> Use camera</Button>
      {/if}
    </Toolbar>

    <div class="min-h-0 overflow-auto">
      {#if !stream && entries.value.length === 0}
        <EmptyState icon={QrCodeIcon} title="No QR codes scanned yet" description="Open an image or use the camera. You can also paste or drop an image here.">
          {#snippet actions()}
            <Button variant="primary" onclick={pick}><ImageSquareIcon weight="bold" /> Open image…</Button>
            <Button onclick={start_camera} disabled={starting}><CameraIcon weight="bold" /> Use camera</Button>
          {/snippet}
        </EmptyState>
      {:else}
        <div class="mx-auto flex max-w-3xl flex-col gap-6 p-4 @md:p-6">
          {#if stream}
            <div class="relative mx-auto overflow-hidden rounded-lg bg-background-darker">
              <video bind:this={video} muted playsinline class="block max-h-64 max-w-full"></video>
              <div class="pointer-events-none absolute inset-0 animate-pulse rounded-lg ring-2 ring-primary ring-inset"></div>
            </div>
          {/if}

          {#if entries.value.length > 0}
            <Section title="History" description="Newest first. Kept in this app's storage.">
              {#snippet actions()}
                <Button variant="quiet" size="sm" onclick={clear_all}><TrashIcon weight="bold" /> Clear all ({entries.value.length})</Button>
              {/snippet}
              {#each entries.value as entry (entry.id)}
                {@const link = is_url(entry.content)}
                <div class="flex items-start gap-3 p-2">
                  <img src={entry.image_url} alt="Scanned QR code" class="size-16 shrink-0 rounded-md bg-background-darker object-contain" />
                  <div class="min-w-0 flex-1 py-0.5">
                    <p class="font-mono text-2xs text-foreground/65 tabular-nums">{format_datetime(entry.scanned_at)}</p>
                    {#if link}
                      <a href={entry.content} target="_blank" rel="noopener noreferrer" class="font-mono text-ui break-all text-primary underline-offset-2 hover:underline">{entry.content}</a>
                    {:else}
                      <p class="font-mono text-ui break-all whitespace-pre-wrap">{entry.content}</p>
                    {/if}
                  </div>
                  <div class="flex shrink-0 gap-0.5">
                    {#if link}
                      <a href={entry.content} target="_blank" rel="noopener noreferrer" aria-label="Open link" title="Open link" class={button({ variant: "quiet", size: "sm", icon: true })}>
                        <ArrowSquareOutIcon weight="bold" />
                      </a>
                    {/if}
                    <IconButton label={copied_id === entry.id ? "Copied" : "Copy"} size="sm" onclick={() => copy(entry)}>
                      {#if copied_id === entry.id}<CheckIcon weight="bold" class="text-success" />{:else}<CopyIcon weight="bold" />{/if}
                    </IconButton>
                    <IconButton label="Remove" size="sm" onclick={() => remove(entry.id)}><XIcon weight="bold" /></IconButton>
                  </div>
                </div>
              {/each}
            </Section>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

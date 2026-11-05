<script lang="ts">
  import kernel, { type AppsService, type DialogsService, type FilesService, type NotificationsService } from "$lib/core/api";
  import { Button, EmptyState, Spinner } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import { report_error } from "$kit/utils/report-error";
  import type { Point } from "$kit/utils/view";
  import { Camera as CameraIcon, Warning as WarningIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { Camera, shutter_feedback } from "./camera.svelte";
  import CameraView from "./camera-view.svelte";
  import Gallery from "./gallery.svelte";
  import {
    APP_ID,
    DEFAULT_EXPIRY,
    EMPTY_INDEX,
    EXPIRY,
    expiry_ms,
    INDEX_FILE,
    IndexSchema,
    new_id,
    newest_first,
    type Batch,
    type Expiry,
    type Photo,
    type ViewerItem,
  } from "./photos";
  import { clean_orphans, delete_batch, delete_photo, erase_expired, save_shot, save_to_pictures, type BatchMeta } from "./store";
  import Viewer from "./viewer.svelte";

  const { window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const index = storage.file(INDEX_FILE, EMPTY_INDEX, IndexSchema);
  const ticker = new Ticker(() => win.is_visible, 30_000);
  const now = $derived(ticker.now);
  const usable = $derived(index.ready && !index.error);
  const batches = $derived(usable ? newest_first(index.value.batches) : []);
  const items = $derived<ViewerItem[]>(batches.flatMap((batch) => batch.photos.map((photo) => ({ photo, batch }))));

  let camera_open = $state(false);
  let failed = $state(false);
  let session = $state<BatchMeta | null>(null);
  let expiry = $state<Expiry>(DEFAULT_EXPIRY);
  let shots = $state(0);
  let pending = $state(0);
  let last = $state<string | null>(null);
  let viewing = $state<string | null>(null);
  let focus = $state<string | null>(null);

  const at = $derived(viewing ? items.findIndex((item) => item.photo.id === viewing) : -1);

  const camera = new Camera({
    visible: () => win.is_visible,
    onerror: (reason) => {
      failed = true;
      console.warn("[Glimpse] camera failed", reason);
    },
  });

  let started = false;
  $effect(() => {
    if (!index.ready || started) return;
    started = true;
    untrack(() => void start());
  });

  async function start() {
    if (index.error) return;
    if (index.value.batches.every((batch) => batch.expires <= Date.now())) open_camera();
    try {
      await erase_expired(files, index);
      await clean_orphans(files, index);
    } catch (reason) {
      report_error(APP_ID, "Couldn't tidy up old photos", reason);
    }
  }

  $effect(() => {
    if (!usable) return;
    const moment = now;
    if (!index.value.batches.some((batch) => batch.expires <= moment)) return;
    untrack(() => erase_expired(files, index, moment).catch((reason: unknown) => report_error(APP_ID, "Couldn't erase old photos", reason)));
  });

  $effect(() => {
    if (viewing && at === -1) viewing = null;
  });

  $effect(() => {
    if (!viewing && !camera_open) return;
    return win.on_back(() => {
      if (viewing) viewing = null;
      else close_camera();
      return true;
    });
  });

  function open_camera() {
    const created = Date.now();
    expiry = DEFAULT_EXPIRY;
    session = { id: new_id(created), created, expires: created + expiry_ms(expiry) };
    shots = 0;
    last = null;
    failed = false;
    focus = null;
    viewing = null;
    camera_open = true;
    void camera.start();
  }

  function close_camera() {
    camera.stop();
    camera_open = false;
    session = null;
  }

  function retry_camera() {
    failed = false;
    void camera.start();
  }

  const stored = (id: string) => index.value.batches.find((batch) => batch.id === id);

  function set_expiry(next: Expiry) {
    expiry = next;
    if (!session) return;
    session.expires = session.created + expiry_ms(next);
    const batch = stored(session.id);
    if (batch) batch.expires = session.expires;
  }

  async function shoot(video: HTMLVideoElement) {
    const meta = session;
    if (!meta) return;
    shutter_feedback();
    const taken = Date.now();
    const id = new_id(taken);
    const turn = camera.turn;
    let frame: ImageBitmap;
    try {
      frame = await camera.grab(video);
    } catch (reason) {
      report_error(APP_ID, "Couldn't take the photo", reason);
      return;
    }
    shots++;
    pending++;
    save_shot(files, index, () => ({ ...meta }), frame, turn, id, taken)
      .then(() => {
        if (session?.id === meta.id) last = id;
      })
      .catch((reason: unknown) => report_error(APP_ID, "Couldn't save the photo", reason))
      .finally(() => pending--);
  }

  function show_batch() {
    const id = session?.id ?? null;
    close_camera();
    focus = id;
  }

  async function rename(batch: Batch) {
    const name = await win.prompt("Name this batch", { initial: batch.name ?? "", placeholder: "Front door", confirm_label: "Save" });
    if (name === null) return;
    const target = stored(batch.id);
    if (target) target.name = name.trim() || undefined;
  }

  async function remove_batch(batch: Batch) {
    const count = batch.photos.length;
    const sure = await win.confirm(`Delete ${count === 1 ? "this photo" : `these ${count} photos`}?`, { detail: "They're gone at once, not when the batch would erase.", confirm_label: "Delete", danger: true });
    if (sure) await delete_batch(files, index, batch.id).catch((reason: unknown) => report_error(APP_ID, "Couldn't delete the batch", reason));
  }

  async function remove_photo(photo: Photo) {
    const next = items[at + 1] ?? items[at - 1];
    viewing = next?.photo.id ?? null;
    await delete_photo(files, index, photo.id).catch((reason: unknown) => report_error(APP_ID, "Couldn't delete the photo", reason));
  }

  async function extend(batch: Batch, anchor: Point) {
    const choice = await dialogs.menu(
      EXPIRY.map((option) => ({ id: option.value, label: `${option.label} from now` })),
      { anchor }
    );
    const option = EXPIRY.find((entry) => entry.value === choice);
    const target = stored(batch.id);
    if (option && target) target.expires = Date.now() + option.ms;
  }

  async function save(photo: Photo) {
    try {
      const path = await save_to_pictures(files, photo);
      notifications.notify(APP_ID, {
        title: "Saved to Pictures",
        message: path.split("/").at(-1),
        actions: [{ label: "Open", on_click: () => void apps.open(path) }],
      });
    } catch (reason) {
      report_error(APP_ID, "Couldn't save to Pictures", reason);
    }
  }
</script>

<div class="@container relative h-full min-h-0 bg-background">
  {#if !index.ready}
    <div class="grid h-full place-items-center"><Spinner /></div>
  {:else if index.error}
    <EmptyState icon={WarningIcon} tone="error" title="Glimpse can't read its photo list" description="Nothing was erased. The file stays as it is until you take a new photo." details={index.error} />
  {:else if camera_open}
    <CameraView
      {camera}
      {expiry}
      count={shots}
      {pending}
      {last}
      {failed}
      focused={win.is_focused}
      onexpiry={set_expiry}
      onshoot={shoot}
      onclose={close_camera}
      onlast={show_batch}
      onretry={retry_camera}
    />
  {:else}
    {#if batches.length === 0}
      <EmptyState icon={CameraIcon} title="No photos" description="Photos you take here erase themselves when their time is up.">
        {#snippet actions()}
          <Button variant="primary" size="lg" onclick={open_camera}><CameraIcon />Open camera</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <div class="h-full overflow-y-auto">
        <Gallery {batches} {now} {focus} onopen={(id) => (viewing = id)} onrename={rename} ondelete={remove_batch} />
      </div>
      <button
        type="button"
        class="absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] flex h-16 min-w-16 items-center justify-center gap-2 rounded-full bg-primary px-5 text-background shadow-popover hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cottontail active:opacity-70"
        aria-label="Open camera"
        onclick={open_camera}
      >
        <CameraIcon class="size-7" weight="fill" />
        <span class="hidden text-sm font-semibold @md:inline">Camera</span>
      </button>
    {/if}
  {/if}
  {#if viewing && at >= 0}
    <Viewer
      {items}
      {at}
      {now}
      focused={win.is_focused}
      onmove={(next) => (viewing = items[next]?.photo.id ?? null)}
      onclose={() => (viewing = null)}
      onsave={save}
      onextend={extend}
      ondelete={remove_photo}
    />
  {/if}
</div>

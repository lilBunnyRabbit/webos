<script lang="ts" module>
  import type { PhotoSide } from "./data";

  /** A new photo per side, `null` to remove it; sides left out stay as they are. */
  export type PhotoChanges = Partial<Record<PhotoSide, Blob | null>>;
</script>

<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { Button, IconButton, Input, Select, Textarea, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import type { BarcodeDetector } from "$kit/utils/qr";
  import { CameraScan } from "$kit/utils/qr-scan.svelte";
  import {
    Camera as CameraIcon,
    CameraSlash as CameraSlashIcon,
    Check as CheckIcon,
    FolderOpen as FolderOpenIcon,
    ImageSquare as ImageSquareIcon,
    Plus as PlusIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import Barcode from "./barcode.svelte";
  import { CODE_FIELD, SWATCH } from "./colors";
  import { CARD_COLORS, PhotoSide as Side, type CardDraft } from "./data";
  import { CardFormat, FORMAT_OPTIONS, FORMATS, format_from_detected, guess_format, validate_code } from "./formats";
  import Photo from "./photo.svelte";
  import { read_photo } from "./photos";

  interface Props {
    id: string;
    is_new: boolean;
    initial: CardDraft;
    photos: Record<PhotoSide, boolean>;
    detector: () => Promise<BarcodeDetector>;
    onscanimage: (file: File) => Promise<{ value: string; format: string } | null>;
    onsave: (draft: CardDraft, photos: PhotoChanges) => void;
    oncancel: () => void;
    onerror: (title: string, reason: unknown) => void;
  }

  let { id, is_new, initial, photos, detector, onscanimage, onsave, oncancel, onerror }: Props = $props();

  const { window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  let draft = $state<CardDraft>(untrack(() => ({ ...initial })));
  let format_touched = $state(untrack(() => !is_new || initial.code !== ""));
  let submitted = $state(false);
  let changes = $state.raw<PhotoChanges>({});
  let stored = $state.raw<Partial<Record<PhotoSide, Blob>>>({});
  let name_input = $state<HTMLInputElement | null>(null);

  const code = $derived(draft.code.trim());
  const code_error = $derived(validate_code(draft.format, code));
  const name_error = $derived(draft.name.trim() ? null : "Give the card a name");
  const show_code_error = $derived(code_error !== null && (submitted || code.length > 0));

  $effect(() => {
    if (!format_touched) draft.format = guess_format(code);
  });

  $effect(() => {
    const sides = Object.values(Side).filter((side) => untrack(() => photos[side]));
    let live = true;
    Promise.all(sides.map(async (side) => [side, await read_photo(files, id, side)] as const))
      .then((loaded) => {
        if (live) stored = Object.fromEntries(loaded.filter(([, blob]) => blob));
      })
      .catch((reason) => console.warn("[Cards] couldn't read the photos", reason));
    return () => {
      live = false;
    };
  });

  function photo_of(side: PhotoSide): Blob | null {
    const change = changes[side];
    return change === undefined ? (stored[side] ?? null) : change;
  }

  export function apply_scan(scan: { value: string; format: string }) {
    draft.code = scan.value;
    draft.format = format_from_detected(scan.format) ?? guess_format(scan.value);
    format_touched = true;
    if (!draft.name.trim()) queueMicrotask(() => name_input?.focus());
  }

  const camera = new CameraScan({
    constraints: { facingMode: "environment" },
    detector: () => detector(),
    visible: () => win.is_visible,
    oncode(value, _video, format) {
      // macOS reports some PDF417 codes it can't decode with an empty value.
      if (!value) return false;
      apply_scan({ value, format });
      return true;
    },
    onerror: (reason) => onerror("Couldn't start the camera", reason),
  });

  async function scan_file(file: File | undefined) {
    if (!file) return;
    const scan = await onscanimage(file);
    if (scan) apply_scan(scan);
  }

  async function scan_device() {
    const [file] = await pick_device_files({ accept: ["image/*"] });
    await scan_file(file);
  }

  async function scan_files() {
    const path = await win.pick_file({ accept: ["image/*"], title: "Scan a photo of the card" });
    if (!path) return;
    try {
      const file = await files.get_file(path);
      if (!file) throw new Error(`File not found: ${path}`);
      await scan_file(file);
    } catch (reason) {
      onerror("Couldn't read the photo", reason);
    }
  }

  async function add_photo(side: PhotoSide, from: "device" | "files") {
    try {
      let file: File | undefined;
      if (from === "device") [file] = await pick_device_files({ accept: ["image/*"] });
      else {
        const path = await win.pick_file({ accept: ["image/*"], title: `The card's ${side}` });
        file = path ? ((await files.get_file(path)) ?? undefined) : undefined;
      }
      if (file) changes = { ...changes, [side]: file };
    } catch (reason) {
      onerror("Couldn't add the photo", reason);
    }
  }

  function set_format(format: CardFormat) {
    draft.format = format;
    format_touched = true;
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    submitted = true;
    if (name_error || code_error) return;
    camera.stop();
    onsave({ ...draft }, changes);
  }
</script>

<form class="flex h-full min-h-0 flex-col" onsubmit={save} novalidate>
  <Toolbar>
    <IconButton size="sm" label="Cancel" onclick={oncancel}><XIcon weight="bold" /></IconButton>
    <span class="min-w-0 flex-1 truncate text-ui font-medium">{is_new ? "New card" : "Edit card"}</span>
    <Button size="sm" variant="primary" type="submit" class="hidden @lg:inline-flex"><CheckIcon weight="bold" />Save</Button>
  </Toolbar>

  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-xl flex-col gap-5 p-4 @md:p-6">
      {#if camera.active}
        <div class="flex flex-col gap-2">
          <div class="relative overflow-hidden rounded-xl bg-background-darker">
            <video {@attach camera.preview} muted playsinline class="block aspect-[4/3] w-full object-cover"></video>
            <div class="pointer-events-none absolute inset-x-[12%] inset-y-[30%] rounded-lg ring-2 ring-primary"></div>
          </div>
          <p class="text-center text-ui text-foreground/65">Hold the barcode inside the frame.</p>
          <Button size="lg" onclick={() => camera.stop()}><CameraSlashIcon weight="bold" />Stop camera</Button>
        </div>
      {:else}
        <div class="grid grid-cols-2 gap-2">
          <Button size="lg" disabled={camera.starting} onclick={() => camera.start()}>
            <CameraIcon weight="bold" />Scan
          </Button>
          <Button size="lg" onclick={scan_device}><ImageSquareIcon weight="bold" />Scan a photo</Button>
          <Button size="sm" variant="quiet" class="col-span-2 justify-self-center" onclick={scan_files}>
            <FolderOpenIcon weight="bold" />Scan a photo from Files…
          </Button>
        </div>
      {/if}

      <label class="flex flex-col gap-1.5">
        <span class="text-ui font-medium">Name</span>
        <Input size="lg" bind:element={name_input} bind:value={draft.name} placeholder="Store name" autocomplete="off" aria-invalid={submitted && name_error !== null} />
        {#if submitted && name_error}<span class="text-ui text-error" role="alert">{name_error}</span>{/if}
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-ui font-medium">Card number</span>
        <Input
          size="lg"
          bind:value={draft.code}
          class="font-mono"
          placeholder="Scan it or type it"
          inputmode={draft.format === CardFormat.EAN_13 || draft.format === CardFormat.EAN_8 || draft.format === CardFormat.UPC_A || draft.format === CardFormat.UPC_E || draft.format === CardFormat.ITF ? "numeric" : "text"}
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          aria-invalid={show_code_error}
        />
        {#if show_code_error}<span class="text-ui text-error" role="alert">{code_error}</span>{/if}
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-ui font-medium">Format</span>
        <Select size="lg" options={FORMAT_OPTIONS} bind:value={() => draft.format, set_format} />
      </label>

      {#if !code_error && draft.format !== CardFormat.NONE}
        <div class={cn("flex justify-center rounded-xl p-4", CODE_FIELD)}>
          <span class={cn("w-full", FORMATS[draft.format].shape === "square" ? "max-w-32" : "max-w-60")}>
            <Barcode format={draft.format} code={code} />
          </span>
        </div>
      {/if}

      <fieldset class="flex flex-col gap-1.5">
        <legend class="mb-1.5 text-ui font-medium">Colour</legend>
        <div class="flex flex-wrap gap-1">
          {#each CARD_COLORS as color (color)}
            <label class="relative grid size-11 cursor-pointer place-items-center rounded-full">
              <input type="radio" name="color" value={color} bind:group={draft.color} class="peer sr-only" />
              <span class={cn("size-9 rounded-full ring-offset-2 ring-offset-background peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-cottontail", SWATCH[color])}></span>
              <span class="sr-only">{color}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      <label class="flex flex-col gap-1.5">
        <span class="text-ui font-medium">Notes</span>
        <Textarea bind:value={draft.notes} placeholder="PIN, membership level, whose card it is…" rows={3} />
      </label>

      <fieldset class="flex flex-col gap-1.5">
        <legend class="mb-1.5 text-ui font-medium">Photos</legend>
        <div class="grid grid-cols-2 gap-3">
          {#each Object.values(Side) as side (side)}
            {@const blob = photo_of(side)}
            <div class="flex flex-col gap-1.5">
              {#if blob}
                <div class="relative">
                  <Photo {blob} alt="The card's {side}" class="aspect-[1.586] w-full" />
                  <IconButton size="sm" label="Remove the {side} photo" class="absolute top-1 right-1 bg-background/80" onclick={() => (changes = { ...changes, [side]: null })}>
                    <XIcon weight="bold" />
                  </IconButton>
                </div>
              {:else}
                <button
                  type="button"
                  class="grid aspect-[1.586] w-full place-items-center rounded-lg text-ui text-foreground/65 ring-1 ring-foreground/20 ring-inset hover:bg-foreground/6"
                  onclick={() => add_photo(side, "device")}
                >
                  <span class="flex flex-col items-center gap-1"><PlusIcon class="size-5" />Add {side}</span>
                </button>
              {/if}
              <Button size="sm" variant="quiet" onclick={() => add_photo(side, "files")}><FolderOpenIcon weight="bold" />From Files…</Button>
            </div>
          {/each}
        </div>
      </fieldset>
    </div>
  </div>

  <div class="shrink-0 border-t border-foreground/8 bg-background-light p-3 @lg:hidden">
    <Button size="lg" variant="primary" type="submit" class="w-full"><CheckIcon weight="bold" />Save card</Button>
  </div>
</form>

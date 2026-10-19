<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { Button, CopyButton, IconButton, Toolbar } from "$lib/core/components/ui";
  import { cn, format_datetime } from "$lib/core/utils";
  import {
    ArrowLeft as ArrowLeftIcon,
    PencilSimple as PencilSimpleIcon,
    PushPin as PushPinIcon,
    QrCode as QrCodeIcon,
    Storefront as StorefrontIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import Barcode from "./barcode.svelte";
  import CardIcon from "./card-icon.svelte";
  import { CODE_FIELD, CODE_TEXT } from "./colors";
  import { display_name, PhotoSide, type Card } from "./data";
  import { CardFormat, FORMATS } from "./formats";
  import Photo from "./photo.svelte";
  import { read_photo } from "./photos";

  interface Props {
    card: Card;
    /** Bumped after photos are written, so they're read again. */
    photo_version: number;
    onback: () => void;
    onedit: () => void;
    ondelete: () => void;
    onpin: () => void;
    oncheckout: () => void;
    onshare: () => void;
  }

  let { card, photo_version, onback, onedit, ondelete, onpin, oncheckout, onshare }: Props = $props();

  const files = $derived(kernel.service<FilesService>("files"));
  const shape = $derived(FORMATS[card.format].shape);

  let photos = $state.raw<{ side: PhotoSide; blob: Blob }[]>([]);

  $effect(() => {
    const { id, photos: flags } = card;
    void photo_version;
    let live = true;
    const sides = Object.values(PhotoSide).filter((side) => flags[side]);
    Promise.all(sides.map(async (side) => ({ side, blob: await read_photo(files, id, side) })))
      .then((loaded) => {
        if (live) photos = loaded.filter((entry): entry is { side: PhotoSide; blob: File } => entry.blob !== null);
      })
      .catch((reason) => console.warn("[Cards] couldn't read the photos", reason));
    return () => {
      live = false;
    };
  });
</script>

<div class="flex h-full min-h-0 flex-col">
  <Toolbar>
    <IconButton size="sm" label="All cards" onclick={onback}><ArrowLeftIcon weight="bold" /></IconButton>
    <span class="flex min-w-0 flex-1 items-center gap-2">
      <CardIcon name={display_name(card)} color={card.color} class="size-6 text-xs" />
      <span class="truncate text-ui font-medium">{display_name(card)}</span>
    </span>
    <IconButton size="sm" label={card.pinned ? "Unpin" : "Pin to the top"} pressed={card.pinned} onclick={onpin}>
      <PushPinIcon weight={card.pinned ? "fill" : "bold"} />
    </IconButton>
    <IconButton size="sm" label="Share as QR" onclick={onshare}><QrCodeIcon weight="bold" /></IconButton>
    <IconButton size="sm" label="Edit" onclick={onedit}><PencilSimpleIcon weight="bold" /></IconButton>
    <IconButton size="sm" label="Delete" onclick={ondelete}><TrashIcon weight="bold" /></IconButton>
  </Toolbar>

  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-xl flex-col gap-5 p-4 @md:p-6">
      <button
        type="button"
        class={cn(
          "flex flex-col items-center gap-3 rounded-2xl p-5 transition-opacity hover:opacity-85 active:opacity-70",
          CODE_FIELD,
          CODE_TEXT
        )}
        aria-label="Show {display_name(card)} at the checkout"
        onclick={oncheckout}
      >
        {#if card.format !== CardFormat.NONE}
          <span class={cn("w-full", shape === "square" && "max-w-56")}>
            <Barcode format={card.format} code={card.code} />
          </span>
        {/if}
        <span class={cn("font-mono font-semibold tracking-wider break-all tabular-nums", card.format === CardFormat.NONE ? "text-3xl" : "text-lg")}>
          {card.code}
        </span>
      </button>

      <dl class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-ui">
        <dt class="text-foreground/65">Number</dt>
        <dd class="flex min-w-0 items-center gap-1">
          <span class="truncate font-mono">{card.code}</span>
          <CopyButton text={card.code} label="Copy number" />
        </dd>
        <dt class="text-foreground/65">Format</dt>
        <dd>{FORMATS[card.format].label}</dd>
        <dt class="text-foreground/65">Used</dt>
        <dd class="font-mono text-2xs tabular-nums">
          {card.uses === 0 ? "Not yet" : card.uses === 1 ? "Once" : `${card.uses} times`}{card.used_at ? ` · last ${format_datetime(card.used_at)}` : ""}
        </dd>
      </dl>

      {#if card.notes}
        <section class="flex flex-col gap-1">
          <h2 class="text-2xs tracking-wide text-foreground/65 uppercase">Notes</h2>
          <p class="text-sm whitespace-pre-wrap">{card.notes}</p>
        </section>
      {/if}

      {#if photos.length > 0}
        <section class="flex flex-col gap-2">
          <h2 class="text-2xs tracking-wide text-foreground/65 uppercase">Photos</h2>
          <div class="grid gap-3 @md:grid-cols-2">
            {#each photos as photo (photo.side)}
              <figure class="flex flex-col gap-1">
                <Photo blob={photo.blob} alt="{display_name(card)}, {photo.side}" class="aspect-[1.586] w-full" />
                <figcaption class="text-2xs text-foreground/65 capitalize">{photo.side}</figcaption>
              </figure>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  </div>

  <div class="flex shrink-0 justify-center border-t border-foreground/8 bg-background-light p-3">
    <Button size="lg" variant="primary" class="w-full @lg:w-auto @lg:min-w-72" onclick={oncheckout}><StorefrontIcon weight="bold" />Show at checkout</Button>
  </div>
</div>

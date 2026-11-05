<script lang="ts">
  import { Badge, IconButton } from "$lib/core/components/ui";
  import { PencilSimple as PencilSimpleIcon, Trash as TrashIcon } from "phosphor-svelte";
  import { batch_title, time_left, type Batch } from "./photos";
  import Thumb from "./thumb.svelte";

  interface Props {
    batches: Batch[];
    now: number;
    focus: string | null;
    onopen: (photo_id: string) => void;
    onrename: (batch: Batch) => void;
    ondelete: (batch: Batch) => void;
  }

  let { batches, now, focus, onopen, onrename, ondelete }: Props = $props();

  const SOON_MS = 3_600_000;

  const scroll_to = (id: string | null) => (element: HTMLElement) => {
    if (id && element.dataset.batch === id) element.scrollIntoView({ block: "start" });
  };
</script>

<div class="flex flex-col gap-5 px-3 pt-3 pb-28 @md:px-4">
  {#each batches as batch (batch.id)}
    {@const title = batch_title(batch, now)}
    <section class="flex scroll-mt-3 flex-col gap-2" aria-label={title} data-batch={batch.id} {@attach scroll_to(focus)}>
      <header class="flex min-w-0 items-center gap-1.5">
        <h2 class="min-w-0 truncate text-ui font-semibold">{title}</h2>
        <Badge tone={batch.expires - now < SOON_MS ? "warning" : "neutral"} class="font-mono">erases in {time_left(batch.expires, now)}</Badge>
        <span class="hidden shrink-0 text-2xs text-foreground/65 @xs:inline">{batch.photos.length} {batch.photos.length === 1 ? "photo" : "photos"}</span>
        <div class="ml-auto flex shrink-0 items-center">
          <IconButton label="Name this batch" size="sm" onclick={() => onrename(batch)}><PencilSimpleIcon weight="bold" /></IconButton>
          <IconButton label="Delete this batch" size="sm" onclick={() => ondelete(batch)}><TrashIcon weight="bold" /></IconButton>
        </div>
      </header>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1 @md:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]">
        {#each batch.photos as photo, i (photo.id)}
          <button
            type="button"
            class="aspect-square overflow-hidden rounded-md bg-background-darker hover:opacity-85 focus-visible:outline-2 focus-visible:outline-cottontail active:opacity-70"
            aria-label="Photo {i + 1} of {batch.photos.length}"
            onclick={() => onopen(photo.id)}
          >
            <Thumb id={photo.id} />
          </button>
        {/each}
      </div>
    </section>
  {/each}
</div>

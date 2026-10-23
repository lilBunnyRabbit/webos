<script lang="ts">
  import { EmptyState, Section } from "$lib/core/components/ui";
  import { format_bytes } from "$lib/core/utils";
  import { ImageSquare as ImageSquareIcon, Warning as WarningIcon } from "phosphor-svelte";
  import { crop_loss } from "./checks";
  import type { ImageProbe } from "./page";
  import { aspect, orientation, type PageMeta } from "./parse";
  import PreviewImage from "./preview-image.svelte";

  interface Props {
    meta: PageMeta;
    probe: ImageProbe | null;
    probing: boolean;
  }

  const { meta, probe, probing }: Props = $props();

  const FRAMES = [
    { label: "Facebook, LinkedIn, X large", ratio: 1.91 },
    { label: "X recommended", ratio: 2 },
    { label: "iMessage, X summary", ratio: 1 },
  ];

  const card = $derived(meta.derived);
  const declared = $derived(card.image_width && card.image_height ? { width: card.image_width, height: card.image_height } : null);
  const measured = $derived(probe?.loaded && probe.width && probe.height ? { width: probe.width, height: probe.height } : null);
  const size = $derived(measured ?? declared);
  const ratio = $derived(size ? aspect(size.width, size.height) : null);
  const mismatch = $derived(declared && measured && (declared.width !== measured.width || declared.height !== measured.height));

  function loaded_label() {
    if (probing) return "Loading…";
    if (!probe) return "Not loaded: the URL is relative and there's no base URL";
    if (!probe.loaded) return probe.status !== null && probe.status >= 400 ? `Didn't load (HTTP ${probe.status})` : "Didn't load";
    return `${probe.width} × ${probe.height}`;
  }

  function crop_label(target: number) {
    if (ratio === null) return "Unknown";
    const crop = crop_loss(ratio, target);
    if (!crop.side) return "Fits";
    return `Crops ${Math.round(crop.lost * 100)}% of the ${crop.side}`;
  }
</script>

{#snippet row(label: string, value: string, mono = false)}
  <div class="grid gap-x-4 gap-y-0.5 px-4 py-2 @sm:grid-cols-[min(11rem,35%)_1fr] @sm:items-baseline">
    <dt class="text-2xs text-foreground/65 @sm:text-ui">{label}</dt>
    <dd class={mono ? "font-mono text-2xs wrap-anywhere select-text" : "text-ui select-text"}>{value}</dd>
  </div>
{/snippet}

{#if !card.image}
  <EmptyState icon={ImageSquareIcon} title="No preview image" description={'The page has no og:image or twitter:image. Add <meta property="og:image" content="https://…/preview.png">, ideally 1200 × 630.'} />
{:else}
  <div class="flex flex-col gap-5">
    <Section title="Preview image">
      <div class="grid place-items-center bg-foreground/4 p-3">
        <PreviewImage src={card.image} alt={card.image_alt} class="max-h-80 max-w-full rounded-md object-contain" />
      </div>
      <dl class="divide-y divide-hairline">
        {@render row("URL", card.image, true)}
        {@render row("Declared size", declared ? `${declared.width} × ${declared.height}` : "Not declared (og:image:width and og:image:height)")}
        {@render row("Loaded size", loaded_label())}
        {@render row("Ratio", ratio ? `${ratio.toFixed(2)} : 1, ${orientation(ratio)}` : "Unknown")}
        {@render row("File size", probe?.bytes != null ? format_bytes(probe.bytes) : "Unknown: the image's server doesn't let other sites read it")}
        {@render row("Type", probe?.type ?? "Unknown")}
        {#if card.image_alt}{@render row("Alt text", card.image_alt)}{/if}
      </dl>
    </Section>

    {#if mismatch}
      <div class="flex gap-2 rounded-md bg-warning/10 px-3 py-2 text-ui">
        <WarningIcon class="mt-0.5 size-4 shrink-0 text-warning" weight="fill" />
        <span>The tags declare {declared!.width} × {declared!.height}, but the image is {measured!.width} × {measured!.height}. Platforms lay out the card from the declared size before the image loads, so fix the tags.</span>
      </div>
    {/if}

    <Section title="How it gets cropped" description="The same image in the frames platforms put it in.">
      <div class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3 p-3">
        {#each FRAMES as frame (frame.label)}
          <figure class="flex min-w-0 flex-col gap-1.5">
            <div style:aspect-ratio={frame.ratio} class="overflow-hidden rounded-md ring-1 ring-hairline">
              <PreviewImage src={card.image} class="size-full" />
            </div>
            <figcaption class="flex flex-col">
              <span class="text-ui">{frame.label}</span>
              <span class="font-mono text-2xs text-foreground/65">{frame.ratio === 1 ? "1 : 1" : `${frame.ratio} : 1`} · {crop_label(frame.ratio)}</span>
            </figcaption>
          </figure>
        {/each}
      </div>
    </Section>

    {#if meta.og_images.length > 1}
      <Section title="All og:image tags" description="Most platforms take the first. iMessage shows them all side by side.">
        {#each meta.og_images as image, index (index)}
          <div class="flex items-center gap-3 px-4 py-2">
            <PreviewImage src={image.secure_url ?? image.url} class="size-12 shrink-0 rounded-sm" />
            <div class="flex min-w-0 flex-col">
              <span class="font-mono text-2xs wrap-anywhere select-text">{image.url}</span>
              <span class="text-2xs text-foreground/65">{image.width && image.height ? `${image.width} × ${image.height}` : "No declared size"}{image.alt ? ` · ${image.alt}` : ""}</span>
            </div>
          </div>
        {/each}
      </Section>
    {/if}
  </div>
{/if}

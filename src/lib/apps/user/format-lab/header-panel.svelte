<script lang="ts">
  import { Badge, Section } from "$lib/core/components/ui";
  import { format_bytes } from "$lib/core/utils";
  import type { ImageHeader } from "./header";

  interface Props {
    name: string;
    size: number;
    type: string;
    width: number;
    height: number;
    alpha: boolean;
    header: ImageHeader | null;
  }

  let { name, size, type, width, height, alpha, header }: Props = $props();

  const yes_no = (value: boolean | null) => (value === null ? "unknown" : value ? "yes" : "no");

  const rows = $derived.by(() => {
    const list: { label: string; value: string }[] = [
      { label: "File", value: name },
      { label: "Size", value: format_bytes(size) },
      { label: "Type", value: type || "unknown" },
    ];
    if (header) {
      list.push(
        { label: "Format", value: header.format },
        { label: "Dimensions", value: header.width && header.height ? `${header.width} × ${header.height}` : `${width} × ${height}` },
        { label: "Bit depth", value: header.bit_depth ? `${header.bit_depth}-bit${header.float ? " float" : ""}` : "unknown" },
        { label: "Alpha channel", value: yes_no(header.alpha) },
        { label: "Animation", value: yes_no(header.animated) },
        { label: "HDR", value: yes_no(header.hdr) },
        { label: "Colour", value: header.colour ?? "unknown" },
        ...header.extra
      );
    } else {
      list.push({ label: "Dimensions", value: `${width} × ${height}` });
    }
    return list;
  });
</script>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-5 @md:px-6">
  <Section title="What the file says" description={header ? "Read from the header, without decoding." : "Only AVIF and JPEG XL headers are read; this is what the decoder reports."}>
    <dl class="divide-y divide-hairline">
      {#each rows as row (row.label)}
        <div class="flex items-baseline gap-4 px-4 py-2.5">
          <dt class="w-28 shrink-0 text-ui text-foreground/65">{row.label}</dt>
          <dd class="min-w-0 flex-1 font-mono text-ui break-words tabular-nums">{row.value}</dd>
        </div>
      {/each}
    </dl>
  </Section>
  <Section title="What the decoder sees" description="8 bits per channel, sRGB: what the browser or jSquash hands back.">
    <div class="flex flex-wrap items-center gap-2 px-4 py-3">
      <Badge>{width} × {height}</Badge>
      <Badge tone={alpha ? "info" : "neutral"}>{alpha ? "Uses transparency" : "Opaque"}</Badge>
      {#if header?.hdr}<Badge tone="warning">HDR shown tone-mapped</Badge>{/if}
    </div>
  </Section>
</div>

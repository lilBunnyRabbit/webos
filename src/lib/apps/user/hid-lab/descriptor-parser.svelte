<script lang="ts">
  import { Button, Section, Textarea } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { ItemType, parse_descriptor, parse_hex, SAMPLES } from "./descriptor";
  import { field_label, format_hex, report_bytes, report_title } from "./report";

  let text = $state<string>(SAMPLES[0].hex);

  const bytes = $derived(parse_hex(text));
  const parsed = $derived(bytes ? parse_descriptor(bytes) : null);

  const TYPE_CLASS: Record<ItemType, string> = {
    main: "font-semibold text-foreground",
    global: "text-foreground/80",
    local: "text-foreground/80",
    long: "text-foreground/65",
    reserved: "text-warning",
  };
</script>

<Section title="Report descriptor" description="WebHID never hands out a device's raw descriptor. Paste one (hex, 0x list or C array) to read it item by item.">
  <div class="flex flex-col gap-3 p-3">
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-ui text-foreground/65">Samples</span>
      {#each SAMPLES as sample (sample.name)}
        <Button size="sm" variant="quiet" onclick={() => (text = sample.hex)}>{sample.name}</Button>
      {/each}
    </div>
    <Textarea bind:value={text} mono rows={4} aria-label="Report descriptor bytes" placeholder="05 01 09 02 A1 01 …" />
    {#if !bytes}
      <p class="text-ui text-foreground/65">{text.trim() ? "That isn't hex bytes." : "Paste a descriptor to start."}</p>
    {:else if parsed}
      <p class="text-ui text-foreground/65">
        {bytes.length} bytes · {parsed.items.length} items · {parsed.reports.length} report{parsed.reports.length === 1 ? "" : "s"}
      </p>
      {#if parsed.error}<p class="text-ui text-error">{parsed.error}</p>{/if}
    {/if}
  </div>
</Section>

{#if parsed && parsed.reports.length}
  <Section title="Reports">
    {#each parsed.reports as report (`${report.kind}:${report.id}`)}
      <div class="flex flex-col gap-1.5 px-4 py-3">
        <p class="flex items-baseline justify-between gap-3 text-ui">
          <span class="font-medium">{report_title(report)}</span>
          <span class="font-mono text-foreground/65">{report.bits} bits · {report_bytes(report)} B{report.id ? " + ID" : ""}</span>
        </p>
        <ul class="flex flex-col gap-0.5 font-mono text-2xs text-foreground/80">
          {#each report.fields as field, index (index)}
            <li class={cn("flex gap-3", field.constant && "text-foreground/65")}>
              <span class="w-14 shrink-0 tabular-nums">bit {field.bit_offset}</span>
              <span class="w-16 shrink-0 tabular-nums">{field.count}×{field.size}</span>
              <span class="min-w-0 break-words">{field_label(field)}{!field.constant && field.array ? " (array)" : ""}{!field.constant && field.relative ? " (relative)" : ""}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </Section>
{/if}

{#if parsed && parsed.items.length}
  <Section title="Items">
    <ol class="max-h-96 overflow-auto py-1.5 font-mono text-2xs">
      {#each parsed.items as item (item.offset)}
        <li class="flex gap-3 px-4 py-0.5">
          <span class="w-8 shrink-0 text-right text-foreground/65 tabular-nums">{item.offset}</span>
          <span class="hidden w-28 shrink-0 text-foreground/65 @md:block">{format_hex(item.bytes)}</span>
          <span class={cn("min-w-0 break-words", TYPE_CLASS[item.type])} style:padding-left="{item.depth * 1}rem">{item.text}</span>
        </li>
      {/each}
    </ol>
  </Section>
{/if}

<script lang="ts">
  import { Badge, Button, EmptyState, Section } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Plugs as PlugsIcon, Usb as UsbIcon } from "phosphor-svelte";
  import DescriptorParser from "./descriptor-parser.svelte";
  import { HidSession } from "./hid.svelte";
  import { decode_report, field_label, format_hex, report_bytes, report_title } from "./report";
  import { collection_name, extended_usage, extended_name, page_name } from "./usages";
  import { device_ids, device_name, type HidCollectionInfo } from "./webhid";

  const session = new HidSession();

  $effect(() => session.start());
</script>

{#snippet collection_tree(collections: HidCollectionInfo[], depth: number)}
  {#each collections as collection, index (index)}
    <li class="flex flex-col gap-0.5" style:padding-left="{depth}rem">
      <span>
        <span class="text-foreground/65">{collection_name(collection.type)} ·</span>
        {page_name(collection.usagePage)}: {extended_name(extended_usage(collection.usagePage, collection.usage))}
      </span>
    </li>
    {#if collection.children?.length}
      {@render collection_tree(collection.children, depth + 1)}
    {/if}
  {/each}
{/snippet}

<div class="flex flex-col gap-6">
  {#if !session.hid}
    <EmptyState
      icon={UsbIcon}
      title="WebHID isn't available here"
      description="Chrome and Edge on a computer have it. Phones, Safari and Firefox don't, so devices can't be connected here. The descriptor parser below works anywhere."
      class="h-auto rounded-xl bg-background-light p-6 ring-1 ring-foreground/8"
    />
  {:else}
    <Section
      title="Devices"
      description="Devices you've allowed this site to use. Chrome keeps keyboards and mice to itself: they connect, but their input never arrives. Gamepads, macro pads and vendor interfaces work."
    >
      {#snippet actions()}
        <Button size="sm" variant="primary" onclick={() => session.request()}>
          <PlugsIcon class="size-4" /> Connect…
        </Button>
      {/snippet}
      {#each session.devices as device, index (index)}
        {@const active = device === session.selected}
        <button
          type="button"
          class={cn(
            "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 pointer-coarse:py-3.5",
            active ? "bg-foreground/8" : "hover:bg-foreground/4"
          )}
          aria-current={active ? "true" : undefined}
          onclick={() => session.select(device)}
        >
          <UsbIcon class="size-5 shrink-0 text-foreground/65" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{device_name(device)}</span>
            <span class="block font-mono text-2xs text-foreground/65">{device_ids(device)}</span>
          </span>
          {#if device.opened}<Badge tone="success">Open</Badge>{/if}
        </button>
      {:else}
        <p class="px-4 py-3 text-ui text-foreground/65">No devices yet. Connect one to see its collections and reports.</p>
      {/each}
    </Section>
    {#if session.error}<p class="text-ui text-error">{session.error}</p>{/if}

    {#if session.selected}
      {@const device = session.selected}
      <Section title={device_name(device)} description="Vendor {device_ids(device).replace(':', ', product ')}">
        {#snippet actions()}
          {#if session.listening}
            <Button size="sm" onclick={() => session.stop_listening()}>Stop</Button>
          {:else}
            <Button size="sm" variant="primary" onclick={() => session.listen()}>Listen</Button>
          {/if}
          <Button size="sm" variant="quiet" onclick={() => session.forget()}>Forget</Button>
        {/snippet}
        <div class="flex flex-col gap-2 px-4 py-3">
          <p class="text-ui font-medium">Collections</p>
          <ul class="flex flex-col gap-0.5 text-ui">
            {@render collection_tree(device.collections, 0)}
          </ul>
        </div>
        <div class="flex flex-col gap-2 px-4 py-3">
          <p class="text-ui font-medium">Reports</p>
          {#each session.reports as report (`${report.kind}:${report.id}`)}
            <details class="text-ui">
              <summary class="cursor-pointer py-0.5">
                {report_title(report)} <span class="font-mono text-foreground/65">· {report_bytes(report)} B · {report.fields.length} fields</span>
              </summary>
              <ul class="flex flex-col gap-0.5 py-1 pl-4 font-mono text-2xs text-foreground/80">
                {#each report.fields as field, index (index)}
                  <li class="flex gap-3">
                    <span class="w-14 shrink-0">bit {field.bit_offset}</span>
                    <span class="w-16 shrink-0">{field.count}×{field.size}</span>
                    <span class="min-w-0 break-words">{field_label(field)}</span>
                  </li>
                {/each}
              </ul>
            </details>
          {:else}
            <p class="text-ui text-foreground/65">The device shows no reports this site may read.</p>
          {/each}
        </div>
      </Section>

      {#if session.listening}
        <Section title="Live input" description="The latest report per ID, decoded with the layout above.">
          {#each session.live as live (live.id)}
            {@const report = session.input_report(live.id)}
            <div class="flex flex-col gap-2 px-4 py-3">
              <p class="flex items-baseline justify-between gap-3 text-ui">
                <span class="font-medium">{report ? report_title(report) : `Report ${live.id}`}</span>
                <span class="font-mono text-foreground/65">{live.count} received</span>
              </p>
              <p class="font-mono text-ui break-all">{format_hex(live.data)}</p>
              {#if report}
                <dl class="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-x-4 gap-y-1 text-ui">
                  {#each decode_report(report, live.data) as value, index (index)}
                    <div class="flex min-w-0 justify-between gap-2">
                      <dt class="truncate text-foreground/65">{value.label}</dt>
                      <dd class="font-mono">{value.value}</dd>
                    </div>
                  {/each}
                </dl>
              {/if}
            </div>
          {:else}
            <p class="px-4 py-3 text-ui text-foreground/65">Waiting for input… press a button or move a control.</p>
          {/each}
        </Section>
      {/if}
    {/if}
  {/if}

  <DescriptorParser />
</div>

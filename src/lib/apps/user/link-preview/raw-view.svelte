<script lang="ts">
  import { CopyButton, Section } from "$lib/core/components/ui";
  import { format_bytes } from "$lib/core/utils";
  import type { PageMeta } from "./parse";

  interface Props {
    meta: PageMeta;
  }

  const { meta }: Props = $props();

  const sorted = (record: Record<string, string>) => Object.entries(record).sort(([a], [b]) => a.localeCompare(b));

  const page = $derived(
    [
      ["URL", meta.url],
      ["Title", meta.title],
      ["Description", meta.description],
      ["Canonical", meta.canonical],
      ["<base href>", meta.base_href],
      ["Language", meta.language],
      ["Theme color", meta.theme_color],
      ["Robots", meta.robots],
      ["Manifest", meta.manifest],
    ].filter((entry): entry is [string, string] => entry[1] !== null)
  );
  const response = $derived(meta.response);
  const json = $derived(JSON.stringify(meta, null, 2));
</script>

{#snippet rows(entries: [string, string][], mono_keys = true)}
  <dl class="divide-y divide-hairline">
    {#each entries as [key, value], index (index)}
      <div class="grid gap-x-4 gap-y-0.5 px-4 py-2 @sm:grid-cols-[min(13rem,38%)_1fr] @sm:items-baseline">
        <dt class={mono_keys ? "font-mono text-2xs text-foreground/65 wrap-anywhere" : "text-2xs text-foreground/65 @sm:text-ui"}>{key}</dt>
        <dd class="text-ui wrap-anywhere select-text">{value}</dd>
      </div>
    {/each}
  </dl>
{/snippet}

<div class="flex flex-col gap-5">
  <Section title="Page">
    {#snippet actions()}<CopyButton text={json} label="Copy all as JSON" />{/snippet}
    {@render rows(page, false)}
  </Section>

  {#if response}
    <Section title="Response" description="Only the headers the server exposes to other sites are visible.">
      {@render rows(
        [
          ["Requested", response.requested],
          ["Status", `${response.status} ${response.status_text}`.trim()],
          ["Content-Type", response.content_type ?? "—"],
          ["Size", format_bytes(response.bytes)],
          ["Time", `${Math.round(response.ms)} ms`],
          ...sorted(response.headers),
        ],
        false
      )}
    </Section>
  {/if}

  {#each [{ title: "Open Graph", record: meta.open_graph }, { title: "Twitter card", record: meta.twitter }, { title: "Other meta", record: meta.other }] as group (group.title)}
    {#if Object.keys(group.record).length}
      <Section title={group.title}>{@render rows(sorted(group.record))}</Section>
    {/if}
  {/each}

  {#if meta.favicons.length || meta.oembed.length}
    <Section title="Icons and links">
      {@render rows([
        ...meta.favicons.map((icon): [string, string] => [icon.sizes ? `${icon.rel} ${icon.sizes}` : icon.rel, icon.href]),
        ...meta.oembed.map((link): [string, string] => [link.type, link.url]),
      ])}
    </Section>
  {/if}

  {#if meta.json_ld.length || meta.json_ld_errors}
    <Section title="JSON-LD" description={meta.json_ld_errors ? `${meta.json_ld_errors} block(s) aren't valid JSON and were skipped.` : undefined}>
      {#each meta.json_ld as block, index (index)}
        <pre class="max-h-72 overflow-auto px-4 py-2 font-mono text-2xs leading-5 select-text">{JSON.stringify(block, null, 2)}</pre>
      {/each}
    </Section>
  {/if}

  <Section title="All meta tags" description="{meta.raw_meta_tags.length} tags, in document order.">
    {#if meta.raw_meta_tags.length}
      {@render rows(meta.raw_meta_tags.map((tag): [string, string] => [`${tag.attr}="${tag.key}"`, tag.value]))}
    {:else}
      <p class="px-4 py-3 text-ui text-foreground/65">No meta tags.</p>
    {/if}
  </Section>
</div>

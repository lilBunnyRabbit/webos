<script lang="ts">
  import { CopyButton, Input, Section, Segmented, Textarea } from "$lib/core/components/ui";
  import { DIRECTION_OPTIONS, Direction, type DevToolsState } from "../tools";
  import { UrlScope, decode_url, encode_url, parse_url } from "../url";

  let { value = $bindable() }: { value: DevToolsState["url"] } = $props();

  const SCOPE_OPTIONS = [
    { value: UrlScope.COMPONENT, label: "Component" },
    { value: UrlScope.URI, label: "Full URL" },
  ];

  const result = $derived(
    value.direction === Direction.ENCODE ? encode_url(value.input, value.scope) : decode_url(value.input, value.scope)
  );
  const parsed = $derived(value.parse_input.trim() ? parse_url(value.parse_input) : null);
</script>

<Section title="Encode and decode" flush>
  <div class="flex flex-wrap items-center gap-2">
    <Segmented label="Direction" options={DIRECTION_OPTIONS} bind:value={value.direction} />
    <Segmented label="Scope" options={SCOPE_OPTIONS} bind:value={value.scope} />
  </div>
  <p class="text-ui text-foreground/65">
    {value.scope === UrlScope.COMPONENT
      ? "For one query value or path segment: escapes / ? & = # too."
      : "For a whole URL: keeps its structure, escapes only what can't appear in one."}
  </p>
  <Textarea mono bind:value={value.input} rows={4} aria-label="Input" placeholder="Text" />
  <div class="flex items-center justify-between gap-2 px-0.5">
    <h3 class="text-ui font-medium">Result</h3>
    <CopyButton text={result.ok ? result.value : ""} />
  </div>
  {#if result.ok}
    <Textarea mono value={result.value} rows={4} readonly aria-label="Result" />
  {:else}
    <p role="alert" class="rounded-md bg-error/12 px-3 py-2 text-ui text-error">{result.error}</p>
  {/if}
</Section>

<Section title="Parse a URL" flush>
  <Input bind:value={value.parse_input} aria-label="URL to parse" placeholder="https://example.com/path?q=1#top" class="font-mono" />
  {#if value.parse_input.trim() && !parsed}
    <p role="alert" class="rounded-md bg-error/12 px-3 py-2 text-ui text-error">Not an absolute URL. Include the scheme, such as https://.</p>
  {:else if parsed}
    <dl class="divide-y divide-hairline rounded-xl bg-background-light shadow-card ring-1 ring-hairline">
      {#each parsed.parts as part (part.label)}
        <div class="flex items-center gap-3 px-3 py-1.5">
          <dt class="w-20 shrink-0 text-ui text-foreground/65">{part.label}</dt>
          <dd class="min-w-0 flex-1 font-mono text-2xs break-all">{part.value}</dd>
          <CopyButton text={part.value} label="Copy {part.label.toLowerCase()}" />
        </div>
      {/each}
    </dl>

    {#if parsed.params.length}
      <h3 class="px-0.5 text-ui font-medium">Query parameters <span class="text-foreground/65">· {parsed.params.length}</span></h3>
      <div class="overflow-x-auto rounded-xl bg-background-light shadow-card ring-1 ring-hairline">
        <table class="w-full text-left">
          <thead class="text-2xs tracking-wide text-foreground/65 uppercase">
            <tr class="border-b border-hairline">
              <th class="px-3 py-1.5 font-medium">Name</th>
              <th class="px-3 py-1.5 font-medium">Value</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-hairline font-mono text-2xs">
            {#each parsed.params as [name, param], i (i)}
              <tr>
                <td class="px-3 py-1.5 align-top break-all">{name}</td>
                <td class="px-3 py-1.5 align-top break-all">{param}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</Section>

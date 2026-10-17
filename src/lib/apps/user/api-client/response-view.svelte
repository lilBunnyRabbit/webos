<script lang="ts">
  import { Language } from "$lib/core/components/code";
  import { Badge, Button, CopyButton, EmptyState, Segmented } from "$lib/core/components/ui";
  import { format_bytes } from "$lib/core/utils";
  import { File as FileIcon, FloppyDisk as FloppyDiskIcon } from "phosphor-svelte";
  import CodeView from "./code-view.svelte";
  import { ResponseKind, status_line } from "./request";
  import { pretty_json, TEXT_LIMIT, type ApiResponse } from "./send";

  interface Props {
    response: ApiResponse;
    onsave: () => void;
  }

  const { response, onsave }: Props = $props();

  const Tab = { BODY: "body", HEADERS: "headers" } as const;
  type Tab = (typeof Tab)[keyof typeof Tab];
  const Format = { PRETTY: "pretty", RAW: "raw" } as const;
  type Format = (typeof Format)[keyof typeof Format];

  let tab = $state<Tab>(Tab.BODY);
  let format = $state<Format>(Format.PRETTY);

  const tone = $derived(
    response.status >= 500 ? "error" : response.status >= 400 ? "warning" : response.status >= 300 ? "info" : "success"
  );
  const pretty = $derived(response.kind === ResponseKind.JSON && response.text !== null ? pretty_json(response.text) : null);
  const shown = $derived(format === Format.PRETTY && pretty !== null ? pretty : (response.text ?? ""));
  const language = $derived.by(() => {
    if (response.kind === ResponseKind.JSON) return Language.JSON;
    const type = response.content_type.toLowerCase();
    if (type.includes("html") || type.includes("xml")) return Language.HTML;
    if (type.includes("javascript")) return Language.JAVASCRIPT;
    if (type.includes("css")) return Language.CSS;
    return null;
  });

  const image_url = $derived(response.kind === ResponseKind.IMAGE ? URL.createObjectURL(response.blob) : null);
  $effect(() => {
    const url = image_url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });
</script>

<div class="flex h-full min-h-0 flex-col gap-2">
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
    <Badge {tone} class="font-mono">{status_line(response.status, response.status_text)}</Badge>
    <span class="font-mono text-2xs text-foreground/65">{Math.round(response.ms)} ms</span>
    <span class="font-mono text-2xs text-foreground/65">{format_bytes(response.blob.size)}</span>
    {#if response.redirected}
      <span class="min-w-0 truncate font-mono text-2xs text-foreground/65" title={response.url}>→ {response.url}</span>
    {/if}
  </div>

  <div class="flex flex-wrap items-center gap-1.5">
    <Segmented
      size="sm"
      label="Response"
      options={[
        { value: Tab.BODY, label: "Body" },
        { value: Tab.HEADERS, label: `Headers ${response.headers.length}` },
      ]}
      bind:value={tab}
    />
    {#if tab === Tab.BODY && pretty !== null}
      <Segmented
        size="sm"
        label="Body format"
        options={[
          { value: Format.PRETTY, label: "Pretty" },
          { value: Format.RAW, label: "Raw" },
        ]}
        bind:value={format}
      />
    {/if}
    <div class="flex-1"></div>
    {#if tab === Tab.BODY && response.text !== null}<CopyButton text={shown} label="Copy body" />{/if}
    <Button size="sm" variant="quiet" disabled={response.blob.size === 0} onclick={onsave}><FloppyDiskIcon />Save body</Button>
  </div>

  {#if tab === Tab.HEADERS}
    <div class="min-h-0 flex-1 overflow-auto rounded-md ring-1 ring-foreground/8">
      <dl class="grid grid-cols-[minmax(6rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 p-3 font-mono text-2xs">
        {#each response.headers as header (header.name)}
          <dt class="text-foreground/65">{header.name}</dt>
          <dd class="break-all">{header.value}</dd>
        {/each}
      </dl>
      <p class="px-3 pb-3 text-2xs text-foreground/65">
        From another site the browser shows only the headers the server lists in Access-Control-Expose-Headers.
      </p>
    </div>
  {:else if response.blob.size === 0}
    <EmptyState icon={FileIcon} title="No body" description="The server sent headers only." />
  {:else if image_url}
    <div class="checker grid min-h-0 flex-1 place-items-center overflow-auto rounded-md p-3 ring-1 ring-foreground/8">
      <img src={image_url} alt="Response body" class="max-h-full max-w-full object-contain" />
    </div>
  {:else if response.text === null}
    <EmptyState
      icon={FileIcon}
      title={response.kind === ResponseKind.BINARY ? "Binary body" : "Too large to show"}
      description={response.kind === ResponseKind.BINARY
        ? `${response.content_type || "No content type"} · ${format_bytes(response.blob.size)}. Save it to look inside.`
        : `Bodies over ${format_bytes(TEXT_LIMIT)} aren't shown. Save it, or download it to a file.`}
    />
  {:else}
    {#key response}
      <CodeView value={shown} {language} read_only label="Response body" class="min-h-40 flex-1" />
    {/key}
  {/if}
</div>

<style>
  .checker {
    background: repeating-conic-gradient(
        color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%,
        transparent 0 50%
      )
      0 0 / 16px 16px;
  }
</style>

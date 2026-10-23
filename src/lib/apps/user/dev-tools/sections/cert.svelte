<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { Badge, Button, CopyButton, IconButton, Section, Spinner, Textarea } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message, format_datetime } from "$lib/core/utils";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import { FolderOpen as FolderOpenIcon, X as XIcon } from "phosphor-svelte";
  import { CertState, cert_state, read_certificates, type CertParse, type Certificate } from "../cert";
  import type { DevToolsState } from "../tools";

  let { value = $bindable() }: { value: DevToolsState["cert"] } = $props();

  const { window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const clock = new Ticker(() => win.is_visible, 60_000);

  const STATE_TONES = { [CertState.VALID]: "success", [CertState.EXPIRED]: "error", [CertState.NOT_YET]: "warning" } as const;

  interface PickedFile {
    label: string;
    result: Promise<CertParse>;
  }

  let picked = $state.raw<PickedFile | null>(null);
  let file_error = $state<string | null>(null);

  const pasted = $derived(value.input.trim() === "" ? null : read_certificates(value.input));
  const shown = $derived(picked?.result ?? pasted);

  function read(file: File, label: string) {
    file_error = null;
    picked = { label, result: file.arrayBuffer().then((buffer) => read_certificates(new Uint8Array(buffer))) };
  }

  async function pick() {
    const path = await win.pick_file({ title: "Read a certificate" });
    if (!path) return;
    try {
      const file = await files.get_file(path);
      if (!file) throw new Error("The file is gone.");
      read(file, path);
    } catch (reason) {
      picked = null;
      file_error = error_message(reason);
    }
  }

  function rows(cert: Certificate): { label: string; value: string; copy?: boolean }[] {
    return [
      { label: "Subject", value: cert.subject, copy: true },
      { label: "Issuer", value: cert.self_signed ? "Self-signed" : cert.issuer },
      { label: "Valid from", value: format_datetime(cert.not_before) },
      { label: "Valid until", value: format_datetime(cert.not_after) },
      { label: "Serial", value: cert.serial, copy: true },
      { label: "Key", value: cert.key },
      { label: "Signature", value: cert.signature },
      { label: "SHA-256", value: cert.sha256, copy: true },
      { label: "SHA-1", value: cert.sha1, copy: true },
    ];
  }

  const common_name = (cert: Certificate) => /(?:^|, )CN=([^,]+)/.exec(cert.subject)?.[1] ?? cert.subject;
</script>

<Section title="Certificate" flush>
  {#snippet actions()}
    <Button size="sm" onclick={pick}><FolderOpenIcon weight="bold" />Choose file</Button>
  {/snippet}
  {#if picked}
    <div class="flex min-w-0 items-center gap-2 text-ui">
      <span class="min-w-0 flex-1 truncate font-mono text-2xs" title={picked.label}>{picked.label}</span>
      <IconButton label="Clear file" size="sm" onclick={() => (picked = null)}><XIcon weight="bold" /></IconButton>
    </div>
  {:else}
    <Textarea mono bind:value={value.input} rows={6} aria-label="PEM certificate" placeholder={"-----BEGIN CERTIFICATE-----\n…"} />
  {/if}
  {#if file_error}
    <p role="alert" class="rounded-md bg-error/12 px-3 py-2 text-ui text-error">Couldn't read the file: {file_error}</p>
  {:else if !shown}
    <p class="text-ui text-foreground/65">Paste PEM (a whole chain works), or pick a .pem, .crt or .der file. Read here, nothing is sent.</p>
  {/if}
</Section>

{#if shown}
  {#await shown}
    <div class="flex h-24 items-center justify-center"><Spinner label="Reading" /></div>
  {:then result}
    {#if !result.ok}
      <p role="alert" class="rounded-md bg-error/12 px-3 py-2 text-ui text-error">{result.error}</p>
    {:else}
      {#each result.certificates as cert, i (i)}
        {@const validity = cert_state(cert, clock.now)}
        <Section title={common_name(cert)} flush>
          {#snippet actions()}
            {#if result.certificates.length > 1}<Badge>{i + 1} of {result.certificates.length}</Badge>{/if}
            {#if cert.is_ca}<Badge tone="info">CA</Badge>{/if}
            <Badge tone={STATE_TONES[validity.state]}>{validity.text}</Badge>
          {/snippet}
          <dl class="divide-y divide-hairline rounded-xl bg-background-light shadow-card ring-1 ring-hairline">
            {#each rows(cert) as row (row.label)}
              <div class="flex items-center gap-3 px-3 py-1.5">
                <dt class="w-20 shrink-0 text-ui text-foreground/65">{row.label}</dt>
                <dd class="min-w-0 flex-1 font-mono text-2xs break-all">{row.value}</dd>
                {#if row.copy}<CopyButton text={row.value} label="Copy {row.label}" />{/if}
              </div>
            {/each}
            {#if cert.san.length}
              <div class="flex gap-3 px-3 py-1.5">
                <dt class="w-20 shrink-0 text-ui text-foreground/65">Names</dt>
                <dd class="flex min-w-0 flex-1 flex-col font-mono text-2xs break-all">
                  {#each cert.san as name (name)}<span>{name}</span>{/each}
                </dd>
                <CopyButton text={cert.san.join("\n")} label="Copy names" />
              </div>
            {/if}
          </dl>
        </Section>
      {/each}
    {/if}
  {:catch reason}
    <p role="alert" class="rounded-md bg-error/12 px-3 py-2 text-ui text-error">{error_message(reason)}</p>
  {/await}
{/if}

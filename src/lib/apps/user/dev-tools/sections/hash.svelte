<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { Button, CopyButton, IconButton, Section, Spinner, Textarea } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_bytes } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { Devices as DevicesIcon, FolderOpen as FolderOpenIcon, X as XIcon } from "phosphor-svelte";
  import { digest_all, type HashResult } from "../hash";
  import type { DevToolsState } from "../tools";

  let { value = $bindable() }: { value: DevToolsState["hash"] } = $props();

  const { window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  interface PickedFile {
    /** The WebOS path, or the bare name of a file from the device. */
    label: string;
    size: number;
    hashes: Promise<HashResult[]>;
  }

  let picked = $state.raw<PickedFile | null>(null);
  let file_error = $state<string | null>(null);

  const text_hashes = $derived(digest_all(value.input));

  function hash(file: File, label: string) {
    file_error = null;
    picked = { label, size: file.size, hashes: file.arrayBuffer().then(digest_all) };
  }

  async function pick() {
    const path = await win.pick_file({ title: "Hash a file" });
    if (!path) return;
    try {
      const file = await files.get_file(path);
      if (!file) throw new Error("The file is gone.");
      hash(file, path);
    } catch (reason) {
      picked = null;
      file_error = reason instanceof Error ? reason.message : String(reason);
    }
  }

  async function pick_device() {
    const [file] = await pick_device_files();
    if (file) hash(file, file.name);
  }
</script>

{#snippet results(hashes: Promise<HashResult[]>)}
  {#await hashes}
    <div class="flex h-24 items-center justify-center"><Spinner label="Hashing" /></div>
  {:then list}
    <dl class="divide-y divide-foreground/8 rounded-xl bg-background-light ring-1 ring-foreground/8">
      {#each list as hash (hash.algorithm)}
        <div class="flex items-center gap-3 px-3 py-2">
          <dt class="w-16 shrink-0 text-ui font-medium">{hash.algorithm}</dt>
          <dd class="min-w-0 flex-1 font-mono text-2xs break-all text-foreground/80 select-all">{hash.hex}</dd>
          <CopyButton text={hash.hex} label="Copy {hash.algorithm}" />
        </div>
      {/each}
    </dl>
  {:catch reason}
    <p role="alert" class="rounded-md bg-error/12 px-3 py-2 text-ui text-error">{reason}</p>
  {/await}
{/snippet}

<p class="text-ui text-foreground/65">SHA family through the browser's Web Crypto. MD5 isn't offered: browsers don't provide it.</p>

<Section title="Text" description="Hashed as UTF-8." flush>
  <Textarea mono bind:value={value.input} rows={4} aria-label="Text to hash" placeholder="Text to hash" />
  {@render results(text_hashes)}
</Section>

<Section title="File" flush>
  {#snippet actions()}
    <Button size="sm" onclick={pick}><FolderOpenIcon weight="bold" />Choose file</Button>
    <Button size="sm" onclick={pick_device}><DevicesIcon weight="bold" />From device</Button>
  {/snippet}
  {#if file_error}
    <p role="alert" class="rounded-md bg-error/12 px-3 py-2 text-ui text-error">Couldn't read the file: {file_error}</p>
  {:else if picked}
    <div class="flex min-w-0 items-center gap-2 text-ui">
      <span class="min-w-0 flex-1 truncate font-mono text-2xs" title={picked.label}>{picked.label}</span>
      <span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{format_bytes(picked.size)}</span>
      <IconButton label="Clear file" size="sm" onclick={() => (picked = null)}><XIcon weight="bold" /></IconButton>
    </div>
    {@render results(picked.hashes)}
  {:else}
    <p class="text-ui text-foreground/65">Pick a file from WebOS or your device to hash its bytes.</p>
  {/if}
</Section>

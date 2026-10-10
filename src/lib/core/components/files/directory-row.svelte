<script lang="ts">
  import FileIconHandler from "./file-icon.svelte";
  import { CaretRight as CaretRightIcon } from "phosphor-svelte";

  interface Props {
    handle: FileSystemDirectoryHandle;
    /** OS-owned folder (`/etc`, `/var`, `/tmp`, ADR-021). */
    system?: boolean;
  }

  let { handle: entry, system = false }: Props = $props();
</script>

<FileIconHandler name={entry.name} kind="directory" weight="bold" />
<div class="text-left truncate">
  {entry.name}
  {#if system}<span class="ml-2 rounded-sm bg-foreground/10 px-1 text-[0.6875rem] text-foreground/60">system</span>{/if}
</div>
<div class="font-mono text-sm text-foreground/50">-</div>
<CaretRightIcon class="justify-self-end" weight="bold" />

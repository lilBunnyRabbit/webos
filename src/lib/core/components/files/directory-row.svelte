<script lang="ts">
  import FileIconHandler from "./file-icon.svelte";
  import { Badge } from "../ui";

  interface Props {
    handle: FileSystemDirectoryHandle;
    /** OS-owned folder (`/etc`, `/var`, `/tmp`, ADR-021). */
    system?: boolean;
  }

  let { handle: entry, system = false }: Props = $props();
</script>

<span class="grid place-items-center text-primary">
  <FileIconHandler name={entry.name} kind="directory" weight="fill" class="size-4" />
</span>
<span role="gridcell" class="flex min-w-0 items-center gap-2 text-ui">
  <span class="truncate">{entry.name}</span>
  {#if system}<Badge>system</Badge>{/if}
</span>
<span role="gridcell" class="w-16 text-right font-mono text-2xs text-foreground/80">—</span>
<span role="gridcell" class="hidden w-24 @md:block"></span>

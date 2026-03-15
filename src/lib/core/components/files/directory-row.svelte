<script lang="ts">
  import FileIconHandler from "./file-icon.svelte";
  import { CaretRight as CaretRightIcon } from "phosphor-svelte";

  interface Props {
    handle: FileSystemDirectoryHandle;
  }

  let { handle: entry }: Props = $props();
</script>

<FileIconHandler name={entry.name} kind="directory" weight="bold" />
<div class="text-left truncate">{entry.name}</div>
<div class="font-mono text-sm text-foreground/50">-</div>
<CaretRightIcon class="justify-self-end" weight="bold" />

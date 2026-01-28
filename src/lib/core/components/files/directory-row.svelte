<script lang="ts">
  import FileIconHandler from "./file-icon.svelte";
  import { CaretRight as CaretRightIcon } from "phosphor-svelte";
  interface Props {
    handle: FileSystemDirectoryHandle;
  }

  let { handle: entry }: Props = $props();
</script>

<FileIconHandler name={entry.name} kind="directory" weight="bold"/>
<div class="col-span-2 text-left truncate">{entry.name}</div>
<CaretRightIcon class="justify-self-end" weight="bold" />

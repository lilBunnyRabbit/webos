<script lang="ts">
  import { untrack } from "svelte";
  import { create_storage_handle } from "../storage-handle.svelte";

  interface Props {
    app_id: string;
    initial: { count: number };
    onready: (cell: { value: { count: number } }) => void;
  }

  const props: Props = $props();
  untrack(() => props.onready(create_storage_handle(props.app_id, {}).persisted("cell", props.initial)));
</script>

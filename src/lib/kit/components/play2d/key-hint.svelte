<script lang="ts">
  import { Kbd } from "$lib/core/components/ui";

  interface Props {
    key_name: string;
    text: string;
  }

  let { key_name, text }: Props = $props();
</script>

<span class="inline-flex items-center gap-1"><Kbd>{key_name}</Kbd>{text}</span>

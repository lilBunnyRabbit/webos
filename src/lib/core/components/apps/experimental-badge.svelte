<script lang="ts">
  import { Badge } from "../ui";

  let { class: class_name }: { class?: string } = $props();
</script>

<Badge tone="warning" class={class_name}>Experimental</Badge>

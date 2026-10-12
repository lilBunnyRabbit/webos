<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { field } from "$lib/core/components/ui";

  type Props = Omit<HTMLTextareaAttributes, "value"> & { value: string; element?: HTMLTextAreaElement | null };

  let { value = $bindable(), element = $bindable(null), class: class_name, ...rest }: Props = $props();
</script>

<!-- The kit has no multi-line field yet; this borrows the field recipe so it reads as one. -->
<textarea
  bind:this={element}
  bind:value
  spellcheck="false"
  autocapitalize="off"
  autocomplete="off"
  class={field({ class: ["h-auto min-h-24 resize-y py-2 font-mono leading-relaxed pointer-coarse:h-auto", class_name as string] })}
  {...rest}
></textarea>

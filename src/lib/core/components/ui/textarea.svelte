<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { field, type FieldVariants } from "./variants";

  type Props = Omit<HTMLTextareaAttributes, "value"> &
    FieldVariants & {
      value?: string | null;
      element?: HTMLTextAreaElement | null;
      /** Code or data: monospace, no spellcheck or autocomplete. */
      mono?: boolean;
    };

  let { value = $bindable(), element = $bindable(null), size, mono = false, class: class_name, ...rest }: Props = $props();
</script>

<!-- The field recipe sets a fixed height (also on touch, via pointer-coarse:), so both are reset to auto here. -->
<textarea
  bind:this={element}
  bind:value
  spellcheck={mono ? false : undefined}
  autocapitalize={mono ? "off" : undefined}
  autocomplete={mono ? "off" : undefined}
  class={field({ size, class: ["h-auto min-h-24 resize-y py-2 leading-relaxed pointer-coarse:h-auto", mono && "font-mono", class_name as string] })}
  {...rest}
></textarea>

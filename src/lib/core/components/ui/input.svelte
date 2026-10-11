<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn } from "$lib/core/utils";
  import { field, type FieldVariants } from "./variants";

  type Props = Omit<HTMLInputAttributes, "size"> &
    FieldVariants & {
      value?: string | number | null;
      element?: HTMLInputElement | null;
      /** Icon shown inside the field on the left. */
      leading?: Snippet;
      /** Content inside the field on the right, such as a clear button. */
      trailing?: Snippet;
    };

  let {
    value = $bindable(),
    element = $bindable(null),
    size,
    leading,
    trailing,
    class: class_name,
    ...rest
  }: Props = $props();
</script>

{#if leading || trailing}
  <div class={cn("relative flex items-center", class_name as string)}>
    {#if leading}
      <span class="pointer-events-none absolute left-2.5 flex text-foreground/65 [&_svg]:size-3.5">{@render leading()}</span>
    {/if}
    <input bind:this={element} bind:value class={field({ size, class: cn(leading && "pl-8", trailing && "pr-8") })} {...rest} />
    {#if trailing}
      <span class="absolute right-1.5 flex">{@render trailing()}</span>
    {/if}
  </div>
{:else}
  <input bind:this={element} bind:value class={field({ size, class: class_name as string })} {...rest} />
{/if}

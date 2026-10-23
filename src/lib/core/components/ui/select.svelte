<script lang="ts" generics="T extends string">
  import type { HTMLSelectAttributes } from "svelte/elements";
  import { field, type FieldVariants } from "./variants";

  interface Option {
    value: T;
    label: string;
  }

  type Props = Omit<HTMLSelectAttributes, "size" | "value"> & FieldVariants & { value: T; options: Option[] };

  let { value = $bindable(), options, size, class: class_name, ...rest }: Props = $props();
</script>

<!-- Customizable native select (appearance: base-select): the platform handles keyboard, popup and positioning. -->
<select bind:value class={field({ size, class: ["ui-select flex cursor-pointer items-center gap-2 pr-7", class_name as string] })} {...rest}>
  {#each options as option (option.value)}
    <option value={option.value}>{option.label}</option>
  {/each}
</select>

<style>
  .ui-select,
  .ui-select::picker(select) {
    appearance: base-select;
  }

  /* A masked chevron centred in its own box, so flipping it on open turns it in place. */
  .ui-select::picker-icon {
    content: "";
    width: 0.75rem;
    height: 0.75rem;
    margin-left: auto;
    background: currentColor;
    opacity: 0.6;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat;
    transition: rotate 150ms var(--ease-out);
  }

  .ui-select:open::picker-icon {
    rotate: 180deg;
  }

  .ui-select::picker(select) {
    margin-block: 4px;
    padding: 4px;
    border: none;
    border-radius: var(--radius-lg);
    background: var(--background-lighter);
    color: var(--foreground);
    box-shadow: var(--shadow-popover);
  }

  .ui-select option {
    padding: 0.375rem 0.5rem;
    border-radius: var(--radius-sm);
    font-size: var(--text-ui);
  }

  .ui-select option:hover,
  .ui-select option:focus-visible {
    outline: none;
    background: color-mix(in oklch, var(--foreground) 10%, transparent);
  }

  .ui-select option:checked {
    color: var(--primary);
  }

  .ui-select option::checkmark {
    display: none;
  }
</style>

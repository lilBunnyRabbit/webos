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
<select bind:value class={field({ size, class: ["ui-select pr-7", class_name as string] })} {...rest}>
  {#each options as option (option.value)}
    <option value={option.value}>{option.label}</option>
  {/each}
</select>

<style>
  .ui-select,
  .ui-select::picker(select) {
    appearance: base-select;
  }

  .ui-select {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .ui-select::picker-icon {
    content: "";
    width: 0.5rem;
    height: 0.5rem;
    margin-left: auto;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    opacity: 0.6;
    rotate: 45deg;
    translate: 0 -2px;
    transition: rotate 150ms var(--ease-out);
  }

  .ui-select:open::picker-icon {
    rotate: 225deg;
    translate: 0 2px;
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

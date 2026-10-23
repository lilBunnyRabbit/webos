<script lang="ts" generics="T extends string">
  import { cn } from "$lib/core/utils";
  import type { IconComponent } from "./types";

  interface Option {
    value: T;
    label: string;
    icon?: IconComponent;
  }

  interface Props {
    value: T;
    options: Option[];
    label: string;
    /** `sm` matches `sm` buttons in a toolbar (28px, 36px on touch); `md` matches `md` controls. */
    size?: "sm" | "md";
    id?: string;
    "aria-describedby"?: string;
    class?: string;
  }

  let {
    value = $bindable(),
    options,
    label,
    size = "md",
    id,
    "aria-describedby": describedby,
    class: class_name,
  }: Props = $props();

  // One shared name makes the radios a real group: a single Tab stop, arrow keys move the selection.
  const name = $props.id();
</script>

<!-- A radio group drawn as one control: arrow keys, labels and form state come from the radios themselves. -->
<div role="radiogroup" {id} aria-label={label} aria-describedby={describedby} class={cn("inline-flex bg-field p-0.5 shadow-recessed ring-1 ring-inset ring-hairline-strong transition-shadow duration-150 hover:ring-edge", size === "sm" ? "rounded-md" : "rounded-lg", class_name)}>
  {#each options as option (option.value)}
    <label
      class={cn(
        "relative flex cursor-pointer items-center gap-1.5 text-ui font-medium text-foreground/80 transition-[color,background-color,box-shadow] duration-150",
        size === "sm" ? "h-6 rounded-sm px-2.5 pointer-coarse:h-8" : "h-7 rounded-md px-3 pointer-coarse:h-9",
        "hover:text-foreground has-checked:bg-background-lighter has-checked:text-foreground has-checked:shadow-control",
        "has-focus-visible:outline-2 has-focus-visible:outline-cottontail"
      )}
    >
      <input type="radio" class="sr-only" {name} value={option.value} bind:group={value} />
      {#if option.icon}<option.icon class="size-3.5" />{/if}
      {option.label}
    </label>
  {/each}
</div>

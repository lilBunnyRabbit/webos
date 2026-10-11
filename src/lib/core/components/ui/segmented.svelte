<script lang="ts" generics="T extends string">
  import { cn } from "$lib/core/utils";
  import type { IconComponent } from "./types";

  interface Option {
    value: T;
    label: string;
    icon?: IconComponent;
  }

  let {
    value = $bindable(),
    options,
    label,
    id,
    "aria-describedby": describedby,
    class: class_name,
  }: { value: T; options: Option[]; label: string; id?: string; "aria-describedby"?: string; class?: string } = $props();

  // One shared name makes the radios a real group: a single Tab stop, arrow keys move the selection.
  const name = $props.id();
</script>

<!-- A radio group drawn as one control: arrow keys, labels and form state come from the radios themselves. -->
<div role="radiogroup" {id} aria-label={label} aria-describedby={describedby} class={cn("inline-flex rounded-lg bg-[light-dark(var(--background-lightest),var(--background-darker))] p-0.5 ring-1 ring-inset ring-foreground/30", class_name)}>
  {#each options as option (option.value)}
    <label
      class={cn(
        "flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-3 text-ui font-medium text-foreground/80 transition-colors duration-150",
        "hover:text-foreground has-checked:bg-background-light has-checked:text-foreground has-checked:shadow-raised",
        "has-focus-visible:outline-2 has-focus-visible:outline-cottontail"
      )}
    >
      <input type="radio" class="sr-only" {name} value={option.value} bind:group={value} />
      {#if option.icon}<option.icon class="size-3.5" />{/if}
      {option.label}
    </label>
  {/each}
</div>

<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { button, type ButtonVariants } from "./variants";

  /** Icon-only button. `label` is required: it becomes the accessible name and the tooltip. */
  type Props = HTMLButtonAttributes & Omit<ButtonVariants, "icon"> & { label: string; children: Snippet };

  let { variant = "quiet", size, pressed, label, class: class_name, type = "button", children, ...rest }: Props = $props();
</script>

<button
  {type}
  aria-label={label}
  title={label}
  aria-pressed={pressed}
  class={button({ variant, size, pressed, icon: true, class: class_name as string })}
  {...rest}
>
  {@render children()}
</button>

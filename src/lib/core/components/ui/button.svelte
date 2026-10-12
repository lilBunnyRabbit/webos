<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { button, type ButtonVariants } from "./variants";

  type Props = HTMLButtonAttributes & Omit<ButtonVariants, "icon"> & { children: Snippet };

  let { variant, size, pressed, class: class_name, type = "button", children, ...rest }: Props = $props();
</script>

<button {type} aria-pressed={pressed} class={button({ variant, size, pressed, class: class_name as string })} {...rest}>
  {@render children()}
</button>

<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { button, type ButtonVariants } from "./variants";

  type Props = HTMLButtonAttributes & Omit<ButtonVariants, "icon"> & { children: Snippet };

  let { variant, size, class: class_name, type = "button", children, ...rest }: Props = $props();
</script>

<button {type} class={button({ variant, size, class: class_name as string })} {...rest}>
  {@render children()}
</button>

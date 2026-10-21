<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/core/utils";
  import type { IconComponent } from "./types";

  interface Props {
    icon?: IconComponent;
    title: string;
    description?: string;
    tone?: "muted" | "error";
    actions?: Snippet;
    class?: string;
  }

  let {
    icon: Icon,
    title,
    description,
    tone = "muted",
    actions,
    class: class_name,
  }: Props = $props();
</script>

<div class={cn("flex h-full flex-col items-center justify-center gap-3 p-8 text-center", class_name)}>
  {#if Icon}
    <div class={cn("grid size-12 place-items-center rounded-xl bg-foreground/6", tone === "error" ? "text-error" : "text-foreground/65")}>
      <Icon class="size-6" weight="duotone" />
    </div>
  {/if}
  <div class="max-w-72">
    <p class={cn("text-sm font-medium", tone === "error" && "text-error")}>{title}</p>
    {#if description}<p class="mt-0.5 text-ui text-foreground/65">{description}</p>{/if}
  </div>
  {#if actions}<div class="flex gap-2">{@render actions()}</div>{/if}
</div>

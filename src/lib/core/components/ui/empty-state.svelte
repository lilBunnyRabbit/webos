<script lang="ts">
  import type { Snippet } from "svelte";
  import { CaretRight as CaretRightIcon } from "phosphor-svelte";
  import { cn } from "$lib/core/utils";
  import CopyButton from "./copy-button.svelte";
  import type { IconComponent } from "./types";

  interface Props {
    icon?: IconComponent;
    title: string;
    description?: string;
    tone?: "muted" | "error";
    actions?: Snippet;
    details?: string;
    class?: string;
  }

  let {
    icon: Icon,
    title,
    description,
    tone = "muted",
    actions,
    details,
    class: class_name,
  }: Props = $props();
</script>

<div class={cn("flex h-full flex-col items-center justify-center-safe gap-3 p-8 text-center", class_name)}>
  {#if Icon}
    <div class={cn("grid size-12 shrink-0 place-items-center rounded-xl", tone === "error" ? "bg-error/12 text-error" : "bg-foreground/6 text-foreground/65")}>
      <Icon class="size-6" weight="duotone" />
    </div>
  {/if}
  <div class="max-w-sm">
    <p class="text-sm font-medium text-balance">{title}</p>
    {#if description}<p class="mt-0.5 text-ui text-pretty text-foreground/80">{description}</p>{/if}
  </div>
  {#if actions}<div class="flex flex-wrap justify-center gap-2">{@render actions()}</div>{/if}
  {#if details}
    <details class="group/details w-full max-w-md">
      <summary
        class="mx-auto flex h-7 w-fit cursor-pointer list-none items-center gap-1 rounded-md px-2 text-ui text-foreground/80 select-none hover:bg-foreground/6 hover:text-foreground pointer-coarse:h-11 [&::-webkit-details-marker]:hidden"
      >
        <CaretRightIcon weight="bold" class="size-3 transition-transform group-open/details:rotate-90" />
        Details
      </summary>
      <div class="relative mt-1 w-full rounded-lg bg-foreground/5 ring-1 ring-foreground/8">
        <pre class="max-h-48 overflow-auto p-3 pe-10 text-start font-mono text-2xs whitespace-pre-wrap text-foreground/80 [overflow-wrap:anywhere] select-text">{details}</pre>
        <CopyButton text={details} label="Copy details" class="absolute end-1 top-1" />
      </div>
    </details>
  {/if}
</div>

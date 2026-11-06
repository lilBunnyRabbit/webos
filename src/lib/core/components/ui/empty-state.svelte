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
    illustration?: Snippet;
    steps?: string[];
    actions?: Snippet;
    hint?: string;
    details?: string;
    class?: string;
  }

  let {
    icon: Icon,
    title,
    description,
    tone = "muted",
    illustration,
    steps,
    actions,
    hint,
    details,
    class: class_name,
  }: Props = $props();
</script>

<div
  class={cn(
    "flex h-full min-h-0 flex-col items-center justify-center-safe gap-3 overflow-y-auto text-center",
    illustration ? "px-5 py-6 @md:p-8" : "p-8",
    class_name
  )}
>
  {#if illustration}
    <div
      class="mb-1 w-full max-w-sm shrink-0 rounded-2xl bg-background-darker p-4 ring-1 ring-foreground/8 ring-inset [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      aria-hidden="true"
    >
      {@render illustration()}
    </div>
  {:else if Icon}
    <div class={cn("grid size-12 shrink-0 place-items-center rounded-xl", tone === "error" ? "bg-error/12 text-error" : "bg-foreground/6 text-foreground/65")}>
      <Icon class="size-6" weight="duotone" />
    </div>
  {/if}
  <div class={illustration ? "max-w-md" : "max-w-sm"}>
    <p class={cn("text-balance", illustration ? "text-base font-semibold" : "text-sm font-medium")}>{title}</p>
    {#if description}<p class="mt-0.5 text-ui text-pretty text-foreground/80">{description}</p>{/if}
  </div>
  {#if steps?.length}
    <ol class="grid w-full max-w-sm shrink-0 gap-1.5 text-start @xl:max-w-2xl @xl:auto-cols-fr @xl:grid-flow-col">
      {#each steps as step, index (index)}
        <li class="flex items-start gap-2 rounded-lg bg-foreground/4 px-2.5 py-2 text-ui text-pretty text-foreground/80">
          <span class="grid size-5 shrink-0 place-items-center rounded-full bg-foreground/8 font-mono text-2xs font-medium text-foreground">{index + 1}</span>
          <span class="min-w-0 pt-px">{step}</span>
        </li>
      {/each}
    </ol>
  {/if}
  {#if actions}<div class="flex flex-wrap justify-center gap-2">{@render actions()}</div>{/if}
  {#if hint}<p class="-mt-1 text-2xs text-pretty text-foreground/65">{hint}</p>{/if}
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

<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { Heading } from "./outline";

  interface Props {
    headings: Heading[];
    active: string | null;
    onpick: (slug: string) => void;
  }

  let { headings, active, onpick }: Props = $props();
</script>

{#if headings.length === 0}
  <p class="px-2 text-ui text-foreground/65">This page has no sections.</p>
{:else}
  <ul class="flex flex-col border-l border-foreground/10">
    {#each headings as heading (heading.slug)}
      <li>
        <button
          aria-current={active === heading.slug ? "location" : undefined}
          class={cn(
            "-ml-px block w-full border-l-2 py-1 pr-2 text-left text-ui leading-snug transition-colors pointer-coarse:py-2.5",
            heading.depth === 3 ? "pl-6 text-foreground/65" : "pl-3",
            active === heading.slug ? "border-primary text-foreground" : "border-transparent text-foreground/80 hover:text-foreground"
          )}
          onclick={() => onpick(heading.slug)}>{heading.text}</button
        >
      </li>
    {/each}
  </ul>
{/if}

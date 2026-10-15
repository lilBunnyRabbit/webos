<script lang="ts" generics="K extends string">
  import { cn } from "$lib/core/utils";
  import { CaretDown as CaretDownIcon, CaretUp as CaretUpIcon } from "phosphor-svelte";
  import type { Sort } from "../sort";

  let {
    label,
    key,
    sort,
    onsort,
    class: class_name = "",
  }: { label: string; key: K; sort: Sort<K> | null; onsort: (key: K) => void; class?: string } = $props();

  const active = $derived(sort?.key === key);
</script>

<button
  class={cn("flex items-center gap-1 tracking-wide uppercase hover:text-foreground", key !== "name" && "justify-end", active && "text-foreground", class_name)}
  onclick={() => onsort(key)}
>
  {label}
  {#if active}
    {#if sort?.desc}<CaretDownIcon class="size-3" weight="bold" />{:else}<CaretUpIcon class="size-3" weight="bold" />{/if}
  {/if}
</button>

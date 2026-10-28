<script lang="ts">
  import { PRODUCT_CODES, type Product } from "./game";
  import { PRODUCT_INFO } from "./products";

  let { restock, code }: { restock: Product[]; code: string } = $props();
</script>

<ul class="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5" aria-label="To restock">
  {#each restock as product (product)}
    {@const info = PRODUCT_INFO[product]}
    {@const typed = code !== "" && PRODUCT_CODES[product].startsWith(code)}
    <li
      class="cc-drop flex flex-col items-center gap-0.5 rounded-lg bg-foreground/8 px-1 py-1.5 {typed ? 'ring-1 ring-primary ring-inset' : ''}"
      aria-label="{info.name}, code {PRODUCT_CODES[product]}"
    >
      <info.icon class="size-6" weight="duotone" />
      <span class="max-w-full truncate text-2xs text-foreground/80">{info.name}</span>
      <span class="font-mono text-lg font-semibold tabular-nums text-primary">{PRODUCT_CODES[product]}</span>
    </li>
  {/each}
</ul>

<style>
  .cc-drop {
    animation: cc-drop 220ms var(--ease-out);
  }

  @keyframes cc-drop {
    from {
      opacity: 0;
      translate: 0 -0.5rem;
    }
  }
</style>

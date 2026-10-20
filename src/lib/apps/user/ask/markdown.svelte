<script lang="ts">
  import { Lexer, type Token, type Tokens } from "marked";
  import { CopyButton } from "$lib/core/components/ui";
  import { safe_href } from "./ask";

  let { text }: { text: string } = $props();

  // Rendered from tokens, never as HTML: the answer can echo anything the opened file says.
  const tokens = $derived(Lexer.lex(text, { gfm: true }));

  const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;
  const align = (value: Tokens.TableCell["align"]) => (value ? ALIGN[value] : "text-left");
</script>

{#snippet inline(parts: Token[])}
  {#each parts as part, index (index)}
    {#if part.type === "strong"}<strong class="font-semibold">{@render inline(part.tokens ?? [])}</strong>
    {:else if part.type === "em"}<em>{@render inline(part.tokens ?? [])}</em>
    {:else if part.type === "del"}<del>{@render inline(part.tokens ?? [])}</del>
    {:else if part.type === "codespan"}<code class="rounded-xs bg-foreground/8 px-1 font-mono text-[0.92em]">{part.text}</code>
    {:else if part.type === "br"}<br />
    {:else if part.type === "link" || part.type === "image"}
      {@const href = safe_href(part.href)}
      {#if href}<a {href} target="_blank" rel="noreferrer noopener" class="text-primary underline decoration-primary/40 underline-offset-2">{#if part.type === "link"}{@render inline(part.tokens ?? [])}{:else}{part.text || href}{/if}</a>
      {:else}{part.text}{/if}
    {:else if part.type === "text" && part.tokens}{@render inline(part.tokens)}
    {:else if "text" in part}{part.text}{/if}
  {/each}
{/snippet}

{#snippet blocks(parts: Token[])}
  {#each parts as part, index (index)}
    {#if part.type === "paragraph"}
      <p>{@render inline(part.tokens ?? [])}</p>
    {:else if part.type === "heading"}
      <p class={part.depth <= 2 ? "text-sm font-semibold" : "font-semibold"}>{@render inline(part.tokens ?? [])}</p>
    {:else if part.type === "list"}
      <svelte:element this={part.ordered ? "ol" : "ul"} start={part.ordered && part.start !== 1 ? part.start : undefined} class={["grid gap-1 pl-5 marker:text-foreground/55", part.ordered ? "list-decimal" : "list-disc"]}>
        {#each part.items as item, i (i)}
          <li class={["[&>p]:inline", item.task && "-ml-5 list-none"]}>
            {#if item.task}<input type="checkbox" checked={item.checked} disabled class="mr-1.5 align-middle accent-primary" />{/if}
            {@render blocks(item.tokens.filter((token: Token) => token.type !== "checkbox"))}
          </li>
        {/each}
      </svelte:element>
    {:else if part.type === "code"}
      <div class="group/code relative">
        <pre class="overflow-x-auto rounded-md bg-foreground/6 p-2 pr-9 font-mono text-2xs leading-relaxed"><code>{part.text}</code></pre>
        <CopyButton text={part.text} label="Copy code" class="absolute top-1 right-1" />
      </div>
    {:else if part.type === "blockquote"}
      <blockquote class="grid gap-2 border-l-2 border-foreground/15 pl-3 text-foreground/80">{@render blocks(part.tokens ?? [])}</blockquote>
    {:else if part.type === "table"}
      <div class="overflow-x-auto">
        <table class="text-left">
          <thead>
            <tr>{#each part.header as cell, i (i)}<th class={["border-b border-foreground/15 px-2 py-1 font-semibold", align(cell.align)]}>{@render inline(cell.tokens)}</th>{/each}</tr>
          </thead>
          <tbody>
            {#each part.rows as row, r (r)}
              <tr>{#each row as cell, i (i)}<td class={["border-b border-foreground/8 px-2 py-1", align(cell.align)]}>{@render inline(cell.tokens)}</td>{/each}</tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if part.type === "hr"}
      <hr class="border-foreground/10" />
    {:else if part.type === "text"}
      <p>{@render inline(part.tokens ?? [])}</p>
    {:else if part.type === "html"}
      <p>{part.text}</p>
    {/if}
  {/each}
{/snippet}

<div class="grid gap-2 leading-relaxed break-words">{@render blocks(tokens)}</div>

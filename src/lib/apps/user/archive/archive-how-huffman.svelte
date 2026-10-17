<script lang="ts">
  import { Segmented } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Alphabet, huffman, type HuffmanSymbol, type HuffmanUse } from "./huffman";
  import { tree_layout } from "./huffman-tree";
  import type { Lz77Token } from "./lz77";

  let { tokens, bytes }: { tokens: Lz77Token[]; bytes: number } = $props();

  interface Active {
    alphabet: Alphabet;
    id: number;
  }

  interface Cell {
    kind: "char" | "match" | "end";
    text: string;
    uses: HuffmanUse[];
    parts: string[];
  }

  const COLUMN = 40;
  const ROW = 34;
  const PAD = 14;
  const LEAF = { width: 34, height: 20 };

  const ALPHABETS = [
    { value: Alphabet.LITERAL, label: "Characters and lengths" },
    { value: Alphabet.DISTANCE, label: "Distances" },
  ];

  const analysis = $derived(huffman(tokens));
  let alphabet = $state<Alphabet>(Alphabet.LITERAL);
  let active = $state<Active | null>(null);
  const table = $derived(alphabet === Alphabet.LITERAL ? analysis.literal : analysis.distance);

  const active_symbol = $derived.by(() => {
    if (!active) return null;
    const { id } = active;
    return (active.alphabet === Alphabet.LITERAL ? analysis.literal : analysis.distance).symbols.find((symbol) => symbol.id === id) ?? null;
  });
  const focus = $derived(active?.alphabet === alphabet ? active_symbol?.code : undefined);
  const layout = $derived(tree_layout(table.codes, { budget: 16, focus }));
  const labels = $derived(new Map(table.symbols.map((symbol) => [symbol.id, symbol.short])));

  const cells = $derived.by(() => {
    const out: Cell[] = [];
    for (const use of analysis.uses) {
      const token = tokens[use.token];
      if (use.alphabet === Alphabet.DISTANCE) out.at(-1)?.uses.push(use);
      else if (!token) out.push({ kind: "end", text: "end of block", uses: [use], parts: ["end"] });
      else if (token.kind === "literal") out.push({ kind: "char", text: String.fromCodePoint(use.id), uses: [use], parts: [] });
      else out.push({ kind: "match", text: token.text, uses: [use], parts: [`×${token.length}`, `↶${token.distance}`] });
    }
    return out;
  });

  const bars = $derived.by(() => {
    const rows = [
      { label: "Original", hint: "8 bits a byte", bits: bytes * 8 },
      { label: "LZ77 tokens", hint: "equal-length codes", bits: analysis.flat_bits },
      { label: "Huffman", hint: "short codes for common symbols", bits: analysis.bits },
    ];
    const max = Math.max(1, ...rows.map((row) => row.bits));
    return rows.map((row) => ({ ...row, width: (row.bits / max) * 100 }));
  });
  const ratio = $derived(analysis.bits && bytes ? (bytes * 8) / analysis.bits : null);

  function is_active(use: HuffmanUse | undefined): boolean {
    return Boolean(use && active && use.alphabet === active.alphabet && use.id === active.id);
  }

  function point(use: HuffmanUse | undefined) {
    if (use) active = { alphabet: use.alphabet, id: use.id };
  }

  function bits_label(bits: number): string {
    return `${bits.toLocaleString()} bits`;
  }

  function describe(symbol: HuffmanSymbol, flat_width: number): string {
    const what = symbol.kind === "end" ? "The end-of-block marker" : `“${symbol.label}”`;
    const times = symbol.count === 1 ? "once" : `${symbol.count} times`;
    const extra = symbol.extra ? `, plus ${symbol.extra} extra ${symbol.extra === 1 ? "bit" : "bits"} for the exact number` : "";
    const total = symbol.count * (symbol.length + symbol.extra);
    return `${what} is used ${times}. Its code is ${symbol.code}: ${symbol.length} ${symbol.length === 1 ? "bit" : "bits"} instead of ${flat_width} in an equal-length code${extra}. ${bits_label(total)} in all.`;
  }
</script>

<section class="flex flex-col gap-4">
  <div class="flex flex-col gap-1.5">
    <h2 class="text-sm font-semibold">Then Huffman: short codes for common symbols</h2>
    <p class="text-ui text-foreground/80">
      LZ77 leaves a stream of symbols: characters, “copy n”, “back d” and an end marker. Huffman counts them and builds a tree where the common ones sit
      near the top, so their path, the code, is short. Deflate caps codes at 15 bits and numbers them in a fixed order, so only each code's length has to
      be stored.
    </p>
  </div>

  <dl class="grid grid-cols-2 gap-2 @lg:grid-cols-4">
    {#each [
      { label: "Symbols", value: `${analysis.literal.symbols.length + analysis.distance.symbols.length} kinds` },
      { label: "LZ77 tokens", value: bits_label(analysis.flat_bits) },
      { label: "Huffman", value: bits_label(analysis.bits) },
      { label: "Ratio", value: ratio === null ? "—" : `${ratio.toFixed(2)} : 1` },
    ] as stat (stat.label)}
      <div class="flex flex-col gap-0.5 rounded-lg bg-foreground/5 px-3 py-2">
        <dt class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{stat.label}</dt>
        <dd class="truncate font-mono text-sm tabular-nums">{stat.value}</dd>
      </div>
    {/each}
  </dl>

  <div class="flex flex-col gap-2">
    {#each bars as bar (bar.label)}
      <div class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 @md:grid-cols-[6.5rem_minmax(0,1fr)_8rem]">
        <span class="flex flex-col">
          <span class="text-ui">{bar.label}</span>
          <span class="text-2xs text-foreground/65">{bar.hint}</span>
        </span>
        <span class="h-3 rounded-xs bg-foreground/5">
          <span class={cn("block h-full rounded-xs", bar.label === "Huffman" ? "bg-primary" : "bg-foreground/25")} style:width="{bar.width}%"></span>
        </span>
        <span class="col-start-2 font-mono text-2xs text-foreground/65 tabular-nums @md:col-start-auto @md:text-right">
          {bits_label(bar.bits)} · {Math.ceil(bar.bits / 8).toLocaleString()} B
        </span>
      </div>
    {/each}
  </div>

  <Segmented label="Code table" options={ALPHABETS} bind:value={alphabet} class="self-start" />

  {#if table.symbols.length === 0}
    <p class="rounded-lg bg-foreground/5 px-3 py-6 text-center text-ui text-foreground/65">No repeats, so there are no distances to code.</p>
  {:else}
    <div class="grid gap-3 @2xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <div class="max-h-80 overflow-auto rounded-lg ring-1 ring-foreground/8 ring-inset" onmouseleave={() => (active = null)} role="presentation">
        <table class="w-full text-ui">
          <thead class="sticky top-0 bg-background-light text-left text-2xs font-medium tracking-wide text-foreground/65 uppercase">
            <tr>
              <th class="px-3 py-1.5 font-medium">Symbol</th>
              <th class="px-2 py-1.5 text-right font-medium">Uses</th>
              <th class="px-3 py-1.5 font-medium">Code</th>
            </tr>
          </thead>
          <tbody>
            {#each table.symbols as symbol (symbol.id)}
              {@const selected = active?.alphabet === alphabet && active.id === symbol.id}
              <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
              <tr
                tabindex="0"
                class={cn("outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset", selected && "bg-primary text-background")}
                onmouseenter={() => (active = { alphabet, id: symbol.id })}
                onfocus={() => (active = { alphabet, id: symbol.id })}
              >
                <td class="px-3 py-1 font-mono">
                  {symbol.label}
                  {#if symbol.kind !== "literal"}<span class={cn("text-2xs", selected ? "text-background/80" : "text-foreground/65")}>#{symbol.deflate}</span>{/if}
                </td>
                <td class="px-2 py-1 text-right font-mono tabular-nums">{symbol.count}</td>
                <td class="px-3 py-1 font-mono tracking-wider break-all">{symbol.code}{#if symbol.extra}<span class={selected ? "text-background/80" : "text-foreground/65"}>+{symbol.extra}</span>{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="overflow-auto rounded-lg bg-[light-dark(var(--background-lightest),var(--background-darker))] ring-1 ring-foreground/8 ring-inset" onmouseleave={() => (active = null)} role="presentation">
        <svg
          width={layout.columns * COLUMN + PAD * 2}
          height={layout.depth * ROW + PAD * 2 + LEAF.height}
          class="mx-auto block font-mono text-2xs"
          role="img"
          aria-label="Code tree: each step left is a 0, each step right a 1"
        >
          {#each layout.edges as edge (edge.to.code)}
            {@const on_path = focus?.startsWith(edge.to.code)}
            {@const x1 = PAD + edge.from.x * COLUMN + COLUMN / 2}
            {@const y1 = PAD + edge.from.depth * ROW}
            {@const x2 = PAD + edge.to.x * COLUMN + COLUMN / 2}
            {@const y2 = PAD + edge.to.depth * ROW}
            <line {x1} {y1} {x2} {y2} class={on_path ? "stroke-primary" : "stroke-foreground/25"} stroke-width={on_path ? 2 : 1} />
            <text x={(x1 + x2) / 2 + (edge.bit === "0" ? -6 : 6)} y={(y1 + y2) / 2 + 3} text-anchor="middle" class={on_path ? "fill-primary" : "fill-foreground/50"}>{edge.bit}</text>
          {/each}
          {#each layout.nodes as node (node.code)}
            {@const cx = PAD + node.x * COLUMN + COLUMN / 2}
            {@const cy = PAD + node.depth * ROW}
            {#if node.kind === "branch"}
              <circle {cx} {cy} r="3" class={focus?.startsWith(node.code) ? "fill-primary" : "fill-foreground/40"} />
            {:else if node.kind === "group"}
              <g>
                <title>{node.ids.length} rarer symbols, codes starting {node.code}</title>
                <rect x={cx - LEAF.width / 2} y={cy} width={LEAF.width} height={LEAF.height} rx="4" class="fill-foreground/5 stroke-foreground/25" stroke-dasharray="3 2" />
                <text x={cx} y={cy + 14} text-anchor="middle" class="fill-foreground/65">+{node.ids.length}</text>
              </g>
            {:else}
              {@const id = node.ids[0]}
              {@const on = focus === node.code}
              <g role="presentation" onmouseenter={() => (active = { alphabet, id })}>
                <title>{labels.get(id)}: {node.code}</title>
                <rect x={cx - LEAF.width / 2} y={cy} width={LEAF.width} height={LEAF.height} rx="4" class={on ? "fill-primary" : "fill-primary/20"} />
                <text x={cx} y={cy + 14} text-anchor="middle" class={on ? "fill-background" : "fill-foreground"}>{labels.get(id)}</text>
              </g>
            {/if}
          {/each}
        </svg>
      </div>
    </div>
  {/if}

  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-foreground/65">
      <span class="flex items-center gap-1.5"><span class="h-3 w-4 rounded-xs bg-foreground/8"></span> character</span>
      <span class="flex items-center gap-1.5"><span class="h-3 w-4 rounded-xs bg-primary/25"></span> copy length, then distance</span>
      <span class="flex items-center gap-1.5"><span class="h-3 w-4 rounded-xs bg-primary"></span> uses the symbol you point at</span>
    </div>
    <!-- Template whitespace would show under pre-wrap, so the cells sit on one line. -->
    <div role="presentation" class="max-h-64 min-h-16 overflow-auto rounded-lg bg-[light-dark(var(--background-lightest),var(--background-darker))] p-3 ring-1 ring-foreground/8 ring-inset font-mono text-ui leading-7 break-words whitespace-pre-wrap" onmouseleave={() => (active = null)}>{#each cells as cell, index (index)}{#if cell.kind === "char"}<span role="presentation" class={cn("rounded-xs bg-foreground/8", is_active(cell.uses[0]) && "bg-primary text-background")} onmouseenter={() => point(cell.uses[0])}>{cell.text}</span>{:else}<span class="mx-px inline-flex rounded-xs bg-primary/25 text-2xs leading-5 align-[1px]" title={cell.text}>{#each cell.uses as use, part (part)}<span role="presentation" class={cn("rounded-xs px-1", is_active(use) && "bg-primary text-background")} onmouseenter={() => point(use)}>{cell.parts[part]}</span>{/each}</span>{/if}{/each}</div>
    <p class="min-h-10 text-ui text-foreground/80" aria-live="polite">
      {#if active_symbol && active}
        {describe(active_symbol, (active.alphabet === Alphabet.LITERAL ? analysis.literal : analysis.distance).flat_width)}
      {:else}
        Point at a symbol in the table, the tree or the stream to see its code and everywhere it is used.
      {/if}
    </p>
  </div>

  <p class="text-2xs text-foreground/65">
    Bits here count the coded symbols only. A real Deflate block also stores the code lengths, which costs a few dozen bytes, and works on bytes rather
    than characters, so text outside ASCII codes differently.
  </p>
</section>

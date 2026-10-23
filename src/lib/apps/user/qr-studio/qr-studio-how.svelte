<script lang="ts">
  import { Button, IconButton, Segmented, Separator, Slider, Textarea, Toolbar } from "$lib/core/components/ui";
  import { cn, error_message } from "$lib/core/utils";
  import { Pause as PauseIcon, Play as PlayIcon } from "phosphor-svelte";
  import type { Snippet } from "svelte";
  import { BitKind, encode, masked, type QrCode } from "./encode/encode";
  import { format_bits, MASK_FORMULAS, MASKS, Region, version_bits } from "./encode/matrix";
  import { Mode, segment_bits, single_segments } from "./encode/segments";
  import { ECC_FORMAT_BITS, ECC_LEVELS, ECC_RECOVERY, Ecc } from "./encode/tables";
  import QrMatrix from "./qr-matrix.svelte";
  import { HOW_LIMIT, SAMPLE_TEXT } from "./views";

  let { tabs, text = $bindable(), ecc = $bindable() }: { tabs: Snippet; text: string; ecc: Ecc } = $props();

  const BITS_SHOWN = 320;
  const BLOCKS_SHOWN = 4;
  const INTERLEAVE_SHOWN = 48;

  const ECCS = ECC_LEVELS.map((level) => ({ value: level, label: level }));
  const MODE_NAMES: Record<Mode, string> = { numeric: "Numeric", alphanumeric: "Alphanumeric", byte: "Byte", eci: "ECI" };
  const MODE_COST: Record<Mode, string> = {
    numeric: "3 digits in 10 bits",
    alphanumeric: "2 characters in 11 bits",
    byte: "8 bits a byte, UTF-8",
    eci: "names the character set",
  };
  const BIT_STYLE: Record<BitKind, string> = {
    mode: "bg-primary text-background",
    count: "bg-primary/25",
    data: "bg-foreground/8",
    terminator: "bg-foreground/20",
    align: "bg-foreground/20",
    pad: "ring-1 ring-foreground/25 ring-inset",
  };
  const REGIONS = [
    { region: Region.FINDER, label: "Finder", class: "fill-foreground", light: "fill-foreground/15", swatch: "bg-foreground" },
    { region: Region.SEPARATOR, label: "Separator", class: "fill-foreground/30", light: "fill-foreground/10", swatch: "bg-foreground/30" },
    { region: Region.TIMING, label: "Timing", class: "fill-info", light: "fill-info/20", swatch: "bg-info" },
    { region: Region.ALIGNMENT, label: "Alignment", class: "fill-primary", light: "fill-primary/20", swatch: "bg-primary" },
    { region: Region.FORMAT, label: "Format", class: "fill-warning", light: "fill-warning/25", swatch: "bg-warning" },
    { region: Region.VERSION, label: "Version", class: "fill-success", light: "fill-success/25", swatch: "bg-success" },
    { region: Region.DARK, label: "Dark module", class: "fill-error", light: "fill-error/25", swatch: "bg-error" },
  ];

  const result = $derived.by<{ code: QrCode; error: null } | { code: null; error: string }>(() => {
    try {
      return { code: encode(text, { ecc }), error: null };
    } catch (error) {
      return { code: null, error: error_message(error) };
    }
  });
  const code = $derived(result.code);

  const single_bits = $derived(code ? segment_bits(single_segments(text), code.version) : 0);
  const mixed_bits = $derived(code ? segment_bits(code.segments, code.version) : 0);

  const shown_parts = $derived.by(() => {
    if (!code) return [];
    let left = BITS_SHOWN;
    const out: { kind: BitKind; bits: string; segment: number | null }[] = [];
    for (const part of code.parts) {
      if (left <= 0) break;
      out.push({ kind: part.kind, bits: part.bits.slice(0, left).join(""), segment: part.segment });
      left -= part.bits.length;
    }
    return out;
  });
  const total_bits = $derived(code ? code.data_codewords.length * 8 : 0);

  const block_of = $derived.by(() => {
    if (!code) return [];
    const out: { block: number; ecc: boolean }[] = [];
    const longest = Math.max(...code.blocks.map((block) => block.data.length));
    for (let i = 0; i < longest; i++) code.blocks.forEach((block, b) => i < block.data.length && out.push({ block: b, ecc: false }));
    for (let i = 0; i < code.blocks[0].ecc.length; i++) code.blocks.forEach((_, b) => out.push({ block: b, ecc: true }));
    return out;
  });

  let step = $state(0);
  let playing = $state(false);
  const total_steps = $derived(code ? code.order.length : 0);
  $effect(() => {
    step = total_steps;
    playing = false;
  });
  $effect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(function tick() {
      step = Math.min(total_steps, step + Math.max(1, Math.round(total_steps / 300)));
      if (step >= total_steps) playing = false;
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  function play() {
    if (playing) return (playing = false);
    if (step >= total_steps) step = 0;
    playing = true;
  }

  const data_bits = $derived(code ? code.data_codewords.length * 8 : 0);
  const placed = $derived.by(() => {
    const out = new Int32Array(code ? code.size * code.size : 0).fill(-1);
    if (code) for (let i = 0; i < step; i++) out[code.order[i]] = i;
    return out;
  });
  const current_codeword = $derived(step > 0 && step <= data_bits + (code ? (code.codewords.length - code.data_codewords.length) * 8 : 0) ? (step - 1) >>> 3 : -1);
  const zigzag = $derived.by(() => {
    if (!code || step < 2) return "";
    const { size, order } = code;
    let d = "";
    for (let i = 0; i < step; i++) d += `${i ? "L" : "M"}${(order[i] % size) + 0.5} ${Math.floor(order[i] / size) + 0.5}`;
    return d;
  });

  let picked_mask = $state<number | null>(null);
  const mask = $derived(picked_mask ?? code?.mask ?? 0);
  const best = $derived(code ? code.penalties.reduce((low, score, i) => (score.total < code.penalties[low].total ? i : low), 0) : 0);
  const grids = $derived(code ? Array.from({ length: 8 }, (_, i) => masked({ size: code.size, modules: code.unmasked, regions: code.regions }, code.unmasked, code.ecc, i)) : []);

  const format = $derived(code ? format_bits(code.ecc, code.mask).toString(2).padStart(15, "0") : "");

  function region_layers(current: QrCode) {
    return REGIONS.flatMap((entry) => [
      { pick: (i: number) => current.regions[i] === entry.region && current.modules[i] === 1, class: entry.class },
      { pick: (i: number) => current.regions[i] === entry.region && current.modules[i] === 0, class: entry.light },
    ]);
  }

  function hex(byte: number): string {
    return byte.toString(16).padStart(2, "0").toUpperCase();
  }

  function describe_segment(segment: QrCode["segments"][number]): string {
    if (segment.mode === Mode.ECI) return `ECI ${segment.count}`;
    const shown = segment.text.length > 40 ? `${segment.text.slice(0, 40)}…` : segment.text;
    return `“${shown.replace(/\n/g, "⏎")}”`;
  }
</script>

{#snippet stat(label: string, value: string)}
  <div class="flex flex-col gap-0.5 rounded-lg bg-background-light px-3 py-2 shadow-card ring-1 ring-hairline">
    <dt class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{label}</dt>
    <dd class="truncate font-mono text-sm tabular-nums">{value}</dd>
  </div>
{/snippet}

{#snippet step_heading(number: number, title: string)}
  <h2 class="flex items-baseline gap-2 text-sm font-semibold">
    <span class="font-mono text-2xs text-foreground/65 tabular-nums">{number}</span>
    {title}
  </h2>
{/snippet}

<div class="grid h-full grid-rows-[auto_1fr]">
  <Toolbar>
    {@render tabs()}
    <span class="min-w-0 flex-1"></span>
    <Button size="sm" variant="quiet" onclick={() => (text = SAMPLE_TEXT)} disabled={text === SAMPLE_TEXT}>Reset sample</Button>
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    <div class="mx-auto flex max-w-3xl flex-col gap-6 p-4 @md:p-6">
      <div class="flex flex-col gap-1.5">
        <h1 class="text-lg font-medium">How a QR code is made</h1>
        <p class="text-ui text-foreground/80">
          A QR code is a grid of bits. The text becomes a bit stream, Reed–Solomon codes are added so a scuffed code still reads, the bytes snake into the
          grid around fixed patterns, and a mask breaks up blotches. Every step below runs on your text.
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <label class="flex flex-col gap-1.5">
          <span class="flex items-baseline justify-between gap-2 text-ui">
            Text to encode
            <span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{Array.from(text).length} / {HOW_LIMIT}</span>
          </span>
          <Textarea bind:value={text} maxlength={HOW_LIMIT} mono rows={2} />
        </label>
        <div class="flex flex-wrap items-center gap-2 text-ui">
          Error correction
          <Segmented size="sm" label="Error correction" options={ECCS} bind:value={ecc} />
          <span class="text-2xs text-foreground/65">survives {ECC_RECOVERY[ecc]}% damage</span>
        </div>
      </div>

      {#if result.error}
        <p role="alert" class="rounded-lg bg-error/10 px-3 py-2 text-ui text-error">{result.error}</p>
      {:else if code}
        <dl class="grid grid-cols-2 gap-2 @lg:grid-cols-4">
          {@render stat("Version", `${code.version} · ${code.size}×${code.size}`)}
          {@render stat("Data", `${code.data_codewords.length} bytes`)}
          {@render stat("Error correction", `${code.codewords.length - code.data_codewords.length} bytes`)}
          {@render stat("Mask", String(code.mask))}
        </dl>

        <section class="flex flex-col gap-3">
          {@render step_heading(1, "Pick modes")}
          <p class="text-ui text-foreground/80">
            Digits pack tightest, then upper-case letters with a few symbols, then raw bytes. Each run costs a 4-bit mode and a length, so the encoder only
            switches when the saving beats the header.
            {#if mixed_bits < single_bits}
              Mixing saves {single_bits - mixed_bits} bits over one byte segment here.
            {/if}
          </p>
          <ul class="flex flex-col gap-1.5">
            {#each code.segments as segment, i (i)}
              <li class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg bg-background-light px-3 py-2 text-ui shadow-card ring-1 ring-hairline">
                <span class="font-medium">{MODE_NAMES[segment.mode]}</span>
                <span class="order-last w-full min-w-0 truncate font-mono @md:order-none @md:w-auto @md:flex-1">{describe_segment(segment)}</span>
                <span class="ml-auto font-mono text-2xs text-foreground/65 tabular-nums">{segment.bits.length} bits · {MODE_COST[segment.mode]}</span>
              </li>
            {/each}
          </ul>
        </section>

        <section class="flex flex-col gap-3">
          {@render step_heading(2, "Write the bits")}
          <p class="text-ui text-foreground/80">
            Each segment is its mode, its length and its data. A terminator of up to four zeros ends the stream, zeros fill the last byte, and the pad bytes
            11101100 and 00010001 take turns until the version's {code.data_codewords.length} data bytes are full.
          </p>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-foreground/65">
            <span class="flex items-center gap-1.5"><span class="h-3 w-4 rounded-xs bg-primary"></span> mode</span>
            <span class="flex items-center gap-1.5"><span class="h-3 w-4 rounded-xs bg-primary/25"></span> length</span>
            <span class="flex items-center gap-1.5"><span class="h-3 w-4 rounded-xs bg-foreground/8"></span> data</span>
            <span class="flex items-center gap-1.5"><span class="h-3 w-4 rounded-xs bg-foreground/20"></span> terminator and fill</span>
            <span class="flex items-center gap-1.5"><span class="h-3 w-4 rounded-xs ring-1 ring-foreground/25 ring-inset"></span> pad bytes</span>
          </div>
          <div class="rounded-lg bg-field p-3 font-mono text-2xs leading-6 break-all ring-1 ring-hairline ring-inset">{#each shown_parts as part, i (i)}<span class={cn("rounded-xs px-px", BIT_STYLE[part.kind])}>{part.bits}</span>{/each}{#if total_bits > BITS_SHOWN}<span class="text-foreground/65"> … {total_bits - BITS_SHOWN} more bits</span>{/if}</div>
        </section>

        <section class="flex flex-col gap-3">
          {@render step_heading(3, "Add error correction")}
          <p class="text-ui text-foreground/80">
            The data bytes are split into {code.blocks.length}
            {code.blocks.length === 1 ? "block" : "blocks"}. Each block is read as a polynomial over GF(256), the 256-element field where adding is XOR, and
            divided by a generator of degree {code.blocks[0].ecc.length}. The remainder is the block's error correction: with it a reader can rebuild up
            to {Math.floor(code.blocks[0].ecc.length / 2)} wrong bytes per block.
          </p>
          <div class="flex flex-col gap-2">
            {#each code.blocks.slice(0, BLOCKS_SHOWN) as block, b (b)}
              <div class="flex flex-col gap-1">
                <span class="text-2xs text-foreground/65">Block {b + 1} · {block.data.length} data + {block.ecc.length} ECC</span>
                <div class="flex flex-wrap gap-0.5 font-mono text-2xs">
                  {#each block.data as byte, i (i)}<span class="rounded-xs bg-foreground/8 px-1 py-0.5">{hex(byte)}</span>{/each}
                  {#each block.ecc as byte, i (i)}<span class="rounded-xs bg-primary/25 px-1 py-0.5">{hex(byte)}</span>{/each}
                </div>
              </div>
            {/each}
            {#if code.blocks.length > BLOCKS_SHOWN}
              <p class="text-2xs text-foreground/65">and {code.blocks.length - BLOCKS_SHOWN} more blocks</p>
            {/if}
          </div>
        </section>

        <section class="flex flex-col gap-3">
          {@render step_heading(4, "Interleave")}
          <p class="text-ui text-foreground/80">
            The blocks are dealt out like cards: the first byte of every block, then the second, then the error correction the same way. A smudge then hits
            a few bytes in many blocks instead of many bytes in one.
          </p>
          <div class="flex flex-wrap gap-0.5 font-mono text-2xs">
            {#each code.codewords.slice(0, INTERLEAVE_SHOWN) as byte, i (i)}
              <span class={cn("flex flex-col items-center rounded-xs px-1 py-0.5", block_of[i].ecc ? "bg-primary/25" : "bg-foreground/8")}>
                {hex(byte)}<span class="text-[0.625rem] leading-3 text-foreground/65">B{block_of[i].block + 1}</span>
              </span>
            {/each}
            {#if code.codewords.length > INTERLEAVE_SHOWN}<span class="self-center px-1 text-foreground/65">… {code.codewords.length - INTERLEAVE_SHOWN} more</span>{/if}
          </div>
        </section>

        <section class="flex flex-col gap-3">
          {@render step_heading(5, "Draw the fixed patterns")}
          <p class="text-ui text-foreground/80">
            Three finders tell a camera where the corners are, timing lines give the grid's pitch, alignment patterns correct for a bent page, and reserved
            strips will hold the format{code.version >= 7 ? " and the version" : ""}. Whatever is left is for data.
          </p>
          <div class="grid gap-3 @md:grid-cols-[minmax(0,20rem)_1fr] @md:items-start">
            <QrMatrix size={code.size} label="Fixed patterns of a version {code.version} code" layers={region_layers(code)} />
            <ul class="flex flex-wrap gap-x-4 gap-y-1.5 text-2xs text-foreground/65 @md:flex-col">
              {#each REGIONS as entry (entry.region)}
                {#if entry.region !== Region.VERSION || code.version >= 7}
                  <li class="flex items-center gap-1.5"><span class={cn("size-3 rounded-xs", entry.swatch)}></span>{entry.label}</li>
                {/if}
              {/each}
              <li class="flex items-center gap-1.5"><span class="size-3 rounded-xs ring-1 ring-foreground/25 ring-inset"></span>Data area</li>
            </ul>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          {@render step_heading(6, "Place the bits")}
          <p class="text-ui text-foreground/80">
            Bits go in two columns at a time, starting bottom right, snaking up and then down, stepping around anything already drawn and skipping the
            vertical timing line.
          </p>
          <div class="grid gap-3 @md:grid-cols-[minmax(0,20rem)_1fr] @md:items-start">
            <QrMatrix
              size={code.size}
              label="Bits placed so far"
              layers={[
                { pick: (i) => code.regions[i] !== Region.DATA && code.modules[i] === 1, class: "fill-foreground/25" },
                { pick: (i) => placed[i] >= 0 && placed[i] < data_bits && code.unmasked[i] === 1, class: "fill-foreground" },
                { pick: (i) => placed[i] >= data_bits && code.unmasked[i] === 1, class: "fill-primary" },
                { pick: (i) => current_codeword >= 0 && placed[i] >= 0 && placed[i] >>> 3 === current_codeword, class: "fill-cottontail/60" },
              ]}
            >
              {#if zigzag}<path d={zigzag} class="fill-none stroke-cottontail/70" stroke-width="0.15" stroke-linejoin="round" />{/if}
            </QrMatrix>
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <IconButton size="sm" variant="secondary" label={playing ? "Pause" : "Play"} onclick={play}>
                  {#if playing}<PauseIcon weight="fill" />{:else}<PlayIcon weight="fill" />{/if}
                </IconButton>
                <Slider size="sm" class="flex-1" min={0} max={total_steps} bind:value={step} oninput={() => (playing = false)} aria-label="Bits placed" />
              </div>
              <p class="font-mono text-2xs text-foreground/65 tabular-nums">
                {step} of {total_steps} bits{#if current_codeword >= 0} · {current_codeword < code.data_codewords.length ? "data" : "ECC"} byte {current_codeword + 1} = {hex(code.codewords[current_codeword])}{/if}
              </p>
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-foreground/65">
                <span class="flex items-center gap-1.5"><span class="size-3 rounded-xs bg-foreground"></span> data bit 1</span>
                <span class="flex items-center gap-1.5"><span class="size-3 rounded-xs bg-primary"></span> ECC bit 1</span>
                <span class="flex items-center gap-1.5"><span class="size-3 rounded-xs bg-cottontail/60"></span> the byte being placed</span>
              </div>
              {#if code.order.length > data_bits + (code.codewords.length - code.data_codewords.length) * 8}
                <p class="text-2xs text-foreground/65">The last {code.order.length - code.codewords.length * 8} modules are remainder bits: the grid has a few more cells than whole bytes.</p>
              {/if}
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          {@render step_heading(7, "Choose a mask")}
          <p class="text-ui text-foreground/80">
            Raw data can form big blotches or shapes that look like a finder. Each of the 8 masks flips the data modules where its formula holds. Each result
            is scored: long runs, 2×2 blocks, finder look-alikes and an uneven dark share all cost points. The lowest score wins.
          </p>
          <div class="grid grid-cols-4 gap-2 @lg:grid-cols-8">
            {#each grids as grid, i (i)}
              <button
                type="button"
                class={cn("flex flex-col items-center gap-1 rounded-lg p-1 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-cottontail", i === mask ? "bg-primary/14 ring-1 ring-primary ring-inset" : "hover:bg-foreground/6")}
                aria-pressed={i === mask}
                onclick={() => (picked_mask = i)}
              >
                <QrMatrix size={code.size} quiet={0} label="Mask {i}" layers={[{ pick: (index) => grid.modules[index] === 1, class: "fill-foreground" }]} class="rounded-xs" />
                <span class="font-mono tabular-nums">{i} · {code.penalties[i].total}</span>
              </button>
            {/each}
          </div>
          <div class="grid gap-3 @md:grid-cols-[minmax(0,14rem)_1fr] @md:items-start">
            <div class="flex flex-col gap-1">
              <QrMatrix
                size={code.size}
                label="Where mask {mask} flips"
                layers={[{ pick: (i) => code.regions[i] === Region.DATA && MASKS[mask](i % code.size, Math.floor(i / code.size)), class: "fill-primary/60" }]}
              />
              <span class="font-mono text-2xs text-foreground/65">mask {mask}: {MASK_FORMULAS[mask]}</span>
            </div>
            <div class="overflow-auto rounded-lg ring-1 ring-hairline ring-inset">
              <table class="w-full text-ui">
                <thead class="text-left text-2xs font-medium tracking-wide text-foreground/65 uppercase">
                  <tr>
                    <th class="px-3 py-1.5 font-medium">Mask</th>
                    <th class="px-2 py-1.5 text-right font-medium">Runs</th>
                    <th class="px-2 py-1.5 text-right font-medium">Blocks</th>
                    <th class="px-2 py-1.5 text-right font-medium">Finders</th>
                    <th class="px-2 py-1.5 text-right font-medium">Balance</th>
                    <th class="px-3 py-1.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody class="font-mono tabular-nums">
                  {#each code.penalties as score, i (i)}
                    <tr class={cn("cursor-pointer", i === mask && "bg-primary text-background")} onclick={() => (picked_mask = i)}>
                      <td class="px-3 py-1">{i}{#if i === best}<span class={cn("ml-1.5 font-sans text-2xs", i === mask ? "text-background/80" : "text-foreground/65")}>lowest</span>{/if}</td>
                      <td class="px-2 py-1 text-right">{score.runs}</td>
                      <td class="px-2 py-1 text-right">{score.blocks}</td>
                      <td class="px-2 py-1 text-right">{score.finders}</td>
                      <td class="px-2 py-1 text-right">{score.balance}</td>
                      <td class="px-3 py-1 text-right font-medium">{score.total}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          {@render step_heading(8, "Write the format and finish")}
          <p class="text-ui text-foreground/80">
            The format strip tells the reader the ECC level ({ECC_FORMAT_BITS[code.ecc].toString(2).padStart(2, "0")} for {code.ecc}) and the mask ({code.mask.toString(2).padStart(3, "0")}),
            protected by a BCH code and XORed with 101010000010010 so it is never blank. It is written twice, beside the top-left finder and split between the
            other two.{#if code.version >= 7} Versions 7 and up also store their number, {version_bits(code.version).toString(2).padStart(18, "0")}, in two
              3×6 blocks.{/if} Four light modules of quiet zone go around it.
          </p>
          <div class="grid gap-3 @md:grid-cols-[minmax(0,20rem)_1fr] @md:items-start">
            <QrMatrix
              size={code.size}
              quiet={4}
              label="The finished code"
              layers={[
                { pick: (i) => code.modules[i] === 1 && code.regions[i] !== Region.FORMAT && code.regions[i] !== Region.VERSION, class: "fill-foreground" },
                { pick: (i) => code.regions[i] === Region.FORMAT && code.modules[i] === 1, class: "fill-warning" },
                { pick: (i) => code.regions[i] === Region.FORMAT && code.modules[i] === 0, class: "fill-warning/25" },
                { pick: (i) => code.regions[i] === Region.VERSION && code.modules[i] === 1, class: "fill-success" },
                { pick: (i) => code.regions[i] === Region.VERSION && code.modules[i] === 0, class: "fill-success/25" },
              ]}
            />
            <div class="flex flex-col gap-1">
              <span class="text-2xs text-foreground/65">Format bits</span>
              <span class="font-mono text-ui tracking-wider break-all">{format}</span>
            </div>
          </div>
        </section>

        <Separator />
        <p class="text-2xs text-foreground/65">
          The encoder here is written for this app and checked module for module against a reference library. Kanji mode, structured append and
          micro QR are left out.
        </p>
      {/if}
    </div>
  </div>
</div>

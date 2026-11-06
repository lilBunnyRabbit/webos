<script lang="ts">
  import { ArtArrow, ArtPage, ArtPhoto } from "$kit/components/tool-art";
  import { Section } from "./sections";

  const { tool }: { tool: Section } = $props();

  const SIGNATURE = "M164 74c4-10 8-14 10-8s-4 12 2 6 8-14 10-6 0 10 6 2 6-8 8-2 4 4 10-2";
</script>

<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" fill="none">
  {#snippet stack(x: number, y: number, width: number, height: number, label: string, accent = false)}
    <ArtPage x={x + 8} y={y - 8} {width} {height} lines={0} />
    <ArtPage x={x + 4} y={y - 4} {width} {height} lines={0} />
    <ArtPage {x} {y} {width} {height} {label} {accent} lines={3} />
  {/snippet}

  {#if tool === Section.ORGANIZE}
    {#each [["1", 0, 0], ["3", 1, 0], ["2", 0, 1], ["4", 1, 1]] as [label, column, row] (label)}
      {@const x = 22 + Number(column) * 36}
      {@const y = 6 + Number(row) * 46}
      <g transform={label === "3" ? `rotate(90 ${x + 14} ${y + 19})` : undefined}>
        <ArtPage {x} {y} width={28} height={38} label={String(label)} lines={2} accent={label === "3"} />
      </g>
    {/each}
    <ArtArrow x1={104} x2={130} />
    {#each ["1", "2", "3", "4"] as label, index (label)}
      <ArtPage x={146 + (index % 2) * 36} y={6 + Math.floor(index / 2) * 46} width={28} height={38} {label} lines={2} accent={label === "3"} />
    {/each}
  {:else if tool === Section.MERGE}
    {@render stack(10, 24, 36, 48, "A")}
    {@render stack(56, 24, 36, 48, "B", true)}
    <ArtArrow x1={108} x2={134} />
    <ArtPage x={166} y={10} width={44} height={58} lines={0} />
    <ArtPage x={158} y={20} width={44} height={58} lines={0} />
    <ArtPage x={150} y={30} width={44} height={58} label="A+B" lines={3} />
  {:else if tool === Section.SPLIT}
    {@render stack(18, 24, 44, 60, "1–6")}
    <ArtArrow x1={92} x2={118} />
    {#each ["1–2", "3–4", "5–6"] as label, index (label)}
      <ArtPage x={132 + index * 34} y={24} width={28} height={52} {label} lines={4} accent={index === 1} />
    {/each}
  {:else if tool === Section.SIGN}
    <ArtPage x={30} y={8} width={64} height={84} lines={6} />
    <ArtArrow x1={106} x2={132} />
    <ArtPage x={146} y={8} width={64} height={84} lines={6} />
    <path d={SIGNATURE} class="stroke-primary" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="160" y="80" width="40" height="1" class="fill-foreground/40" />
  {:else if tool === Section.IMAGES}
    <ArtPhoto x={8} y={12} width={36} height={30} />
    <ArtPhoto x={52} y={30} width={36} height={30} tone="muted" />
    <ArtPhoto x={14} y={56} width={36} height={30} />
    <ArtArrow x1={100} x2={126} />
    <ArtPage x={156} y={4} width={56} height={44} lines={0} />
    <ArtPhoto x={164} y={12} width={36} height={30} sun={false} />
    <ArtPage x={150} y={22} width={56} height={74} label="PDF" lines={0} accent />
    <ArtPhoto x={160} y={52} width={36} height={30} />
  {:else if tool === Section.EXPORT}
    {@render stack(22, 24, 48, 64, "PDF", true)}
    <ArtArrow x1={100} x2={126} />
    <ArtPhoto x={140} y={10} width={40} height={32} />
    <ArtPhoto x={188} y={10} width={40} height={32} tone="muted" />
    <ArtPhoto x={140} y={52} width={40} height={32} tone="muted" />
    <ArtPhoto x={188} y={52} width={40} height={32} />
  {/if}
</svg>

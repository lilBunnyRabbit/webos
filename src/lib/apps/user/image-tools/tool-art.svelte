<script lang="ts">
  import { ArtArrow, ArtChecker, ArtPage, ArtPhoto } from "$kit/components/tool-art";
  import { Section } from "./sections";

  const { tool }: { tool: Section } = $props();

  const FORMATS = ["PNG", "JPEG", "WebP", "AVIF", "JXL", "GIF", "BMP", "ICO", "TIFF"];
  const BALL = [62, 50, 40, 50, 62, 50, 40, 50];
</script>

<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" fill="none">
  {#snippet logo(cx: number, cy: number, r: number)}
    <circle {cx} cy={cy - r * 0.35} r={r * 0.55} class="fill-primary" />
    <rect x={cx - r * 0.9} y={cy + r * 0.25} width={r * 1.8} height={r * 0.75} rx={r * 0.35} class="fill-primary" />
  {/snippet}

  {#snippet label(x: number, y: number, text: string, strong = false)}
    <text {x} {y} text-anchor="middle" font-size="10" class={strong ? "fill-primary font-mono font-semibold" : "fill-foreground/80 font-mono"}>{text}</text>
  {/snippet}

  {#snippet gaps(x: number, y: number, width: number, height: number, columns: number, rows: number)}
    {#each Array.from({ length: columns - 1 }, (_, index) => index + 1) as column (column)}
      <rect x={x + (width * column) / columns - 2} y={y - 1} width="4" height={height + 2} class="fill-background-darker" />
    {/each}
    {#each Array.from({ length: rows - 1 }, (_, index) => index + 1) as row (row)}
      <rect x={x - 1} y={y + (height * row) / rows - 2} width={width + 2} height="4" class="fill-background-darker" />
    {/each}
  {/snippet}

  {#if tool === Section.REMOVE_BACKGROUND}
    <rect x="16" y="12" width="80" height="76" rx="3" class="fill-foreground/25 stroke-foreground/20" />
    {@render logo(56, 52, 22)}
    <ArtArrow x1={106} x2={134} />
    <ArtChecker x={144} y={12} width={80} height={76} />
    {@render logo(184, 52, 22)}
  {:else if tool === Section.TRIM}
    <ArtChecker x={12} y={8} width={88} height={84} />
    <ArtPhoto x={34} y={30} width={44} height={40} />
    <rect x="31" y="27" width="50" height="46" rx="2" class="stroke-primary" stroke-dasharray="4 3" stroke-width="1.5" />
    <ArtArrow x1={110} x2={136} />
    <ArtPhoto x={150} y={22} width={64} height={56} />
  {:else if tool === Section.PATCH}
    <ArtPhoto x={8} y={24} width={44} height={52} />
    <text x="60" y="54" text-anchor="middle" font-size="14" class="fill-foreground/65 font-mono">+</text>
    <ArtPhoto x={68} y={24} width={44} height={52} />
    <rect x="90" y="30" width="18" height="10" rx="2" class="fill-foreground" />
    <text x="99" y="38" text-anchor="middle" font-size="7" class="fill-background font-mono font-semibold">LOGO</text>
    <ArtArrow x1={120} x2={146} />
    <ArtPhoto x={156} y={18} width={68} height={64} />
  {:else if tool === Section.REDACT}
    <ArtPage x={22} y={8} width={68} height={84} lines={0} />
    {#each [24, 34, 44, 58, 68] as row, index (row)}
      <rect x="32" y={row} width={index === 1 ? 30 : 46} height="3" rx="1.5" class={index === 1 || index === 3 ? "fill-primary" : "fill-foreground/25"} />
    {/each}
    <ArtArrow x1={104} x2={132} />
    <ArtPage x={150} y={8} width={68} height={84} lines={0} />
    {#each [24, 34, 44, 58, 68] as row, index (row)}
      {#if index === 1}
        <rect x="158" y={row - 3} width="36" height="9" rx="1.5" class="fill-foreground" />
      {:else if index === 3}
        {#each Array.from({ length: 8 }, (_, cell) => cell) as cell (cell)}
          <rect x={158 + cell * 6} y={row - 3} width="6" height="9" class={cell % 3 === 0 ? "fill-foreground/55" : cell % 2 ? "fill-foreground/35" : "fill-foreground/45"} />
        {/each}
      {:else}
        <rect x="160" y={row} width="46" height="3" rx="1.5" class="fill-foreground/25" />
      {/if}
    {/each}
  {:else if tool === Section.JOIN}
    <ArtPhoto x={8} y={14} width={30} height={24} />
    <ArtPhoto x={44} y={38} width={30} height={24} tone="muted" />
    <ArtPhoto x={14} y={62} width={30} height={24} />
    <ArtArrow x1={92} x2={120} />
    <rect x="148" y="8" width="56" height="84" rx="3" class="fill-background-light stroke-foreground/20" />
    <ArtPhoto x={151} y={11} width={50} height={26} sun={false} />
    <ArtPhoto x={151} y={37} width={50} height={26} sun={false} tone="muted" />
    <ArtPhoto x={151} y={63} width={50} height={26} sun={false} />
  {:else if tool === Section.SPLIT}
    <ArtPhoto x={10} y={22} width={90} height={56} />
    <ArtArrow x1={108} x2={134} />
    <ArtPhoto x={142} y={22} width={90} height={56} />
    {@render gaps(142, 22, 90, 56, 3, 2)}
  {:else if tool === Section.SPRITES}
    <rect x="8" y="22" width="96" height="56" rx="3" class="fill-background-light stroke-foreground/20" />
    {#each BALL as top, index (index)}
      {@const column = index % 4}
      {@const row = Math.floor(index / 4)}
      <rect x={11 + column * 23} y={25 + row * 26} width="21" height="24" rx="2" class="fill-foreground/6" />
      <circle cx={21.5 + column * 23} cy={25 + row * 26 + (top - 22) * 0.4} r="5" class="fill-primary" />
    {/each}
    <ArtArrow x1={112} x2={138} />
    <rect x="152" y="12" width="64" height="56" rx="3" class="fill-background-light stroke-foreground/20" />
    <circle cx="184" cy="36" r="10" class="fill-primary" />
    <ellipse cx="184" cy="60" rx="10" ry="2" class="fill-foreground/20" />
    {#each [0, 1, 2, 3, 4] as frame (frame)}
      <rect x={152 + frame * 13.2} y="74" width="11" height="14" rx="2" class={frame === 2 ? "fill-primary/30 stroke-primary" : "fill-foreground/10"} />
    {/each}
  {:else if tool === Section.ATLAS}
    <rect x="12" y="14" width="22" height="30" rx="2" class="fill-primary" />
    <rect x="44" y="10" width="34" height="18" rx="2" class="fill-foreground/35" />
    <rect x="70" y="40" width="22" height="22" rx="2" class="fill-primary/55" />
    <rect x="20" y="58" width="40" height="16" rx="2" class="fill-foreground/35" />
    <rect x="40" y="34" width="16" height="16" rx="2" class="fill-primary/55" />
    <rect x="68" y="72" width="26" height="14" rx="2" class="fill-primary" />
    <ArtArrow x1={104} x2={130} />
    <rect x="140" y="12" width="60" height="76" rx="3" class="fill-background-light stroke-foreground/20" />
    <rect x="143" y="15" width="22" height="30" rx="1.5" class="fill-primary" />
    <rect x="166" y="15" width="31" height="18" rx="1.5" class="fill-foreground/35" />
    <rect x="166" y="34" width="22" height="22" rx="1.5" class="fill-primary/55" />
    <rect x="143" y="46" width="22" height="16" rx="1.5" class="fill-primary/55" />
    <rect x="143" y="63" width="40" height="16" rx="1.5" class="fill-foreground/35" />
    <rect x="184" y="63" width="13" height="22" rx="1.5" class="fill-primary" />
    <rect x="206" y="40" width="28" height="20" rx="3" class="fill-foreground/8" />
    {@render label(220, 54, "{ }")}
  {:else if tool === Section.SQUASH}
    {#each [0, 1, 2] as layer (layer)}
      <ArtPhoto x={20 + layer * 8} y={10 + layer * 8} width={56} height={46} sun={layer === 2} />
    {/each}
    {@render label(56, 86, "4.2 MB")}
    <ArtArrow x1={104} x2={130} />
    {#each [0, 1, 2] as layer (layer)}
      <ArtPhoto x={160 + layer * 6} y={22 + layer * 6} width={36} height={30} sun={layer === 2} />
    {/each}
    {@render label(184, 86, "380 KB", true)}
  {:else if tool === Section.FIT}
    <ArtPhoto x={14} y={10} width={74} height={58} />
    {@render label(51, 86, "5.2 MB")}
    <ArtArrow x1={104} x2={130} />
    <ArtPhoto x={152} y={18} width={60} height={46} />
    <rect x="144" y="76" width="76" height="6" rx="3" class="fill-foreground/10" />
    <rect x="144" y="76" width="56" height="6" rx="3" class="fill-primary" />
    <rect x="203" y="71" width="2" height="16" rx="1" class="fill-foreground/80" />
    {@render label(204, 97, "1 MB")}
  {:else if tool === Section.CONVERT}
    <ArtPhoto x={12} y={18} width={76} height={64} />
    <ArtArrow x1={100} x2={126} />
    {#each FORMATS as format, index (format)}
      {@const column = index % 3}
      {@const row = Math.floor(index / 3)}
      <rect x={136 + column * 32} y={14 + row * 25} width="28" height="20" rx="3" class={index === 2 ? "fill-primary/15 stroke-primary/60" : "fill-foreground/8"} />
      <text x={150 + column * 32} y={27.5 + row * 25} text-anchor="middle" font-size="7.5" class={index === 2 ? "fill-primary font-mono font-semibold" : "fill-foreground/80 font-mono"}>{format}</text>
    {/each}
  {:else if tool === Section.COMPARE}
    <ArtPhoto x={40} y={10} width={80} height={80} />
    <ArtPhoto x={120} y={10} width={80} height={80} tone="muted" />
    <rect x="119" y="6" width="2" height="88" class="fill-foreground" />
    <circle cx="120" cy="50" r="9" class="fill-foreground" />
    <path d="M116 47l-3 3l3 3M124 47l3 3l-3 3" class="stroke-background" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  {:else if tool === Section.POSTER}
    <ArtPhoto x={12} y={22} width={68} height={56} />
    <ArtArrow x1={92} x2={118} />
    <ArtPhoto x={136} y={10} width={92} height={80} />
    {@render gaps(136, 10, 92, 80, 2, 2)}
    {#each [[136, 10], [228, 10], [136, 90], [228, 90]] as [cx, cy], index (index)}
      <path d="M{cx - (cx > 180 ? -2 : 2)} {cy}h{cx > 180 ? 4 : -4}M{cx} {cy - (cy > 50 ? -2 : 2)}v{cy > 50 ? 4 : -4}" class="stroke-foreground/65" stroke-width="1" />
    {/each}
  {:else if tool === Section.TEST_IMAGE}
    <rect x="60" y="10" width="120" height="80" rx="3" class="fill-background-light stroke-foreground/20" />
    <path d="M60 10L180 90M180 10L60 90" class="stroke-foreground/20" />
    <circle cx="120" cy="50" r="24" class="stroke-primary" stroke-width="2" />
    {@render label(120, 54, "1920×1080")}
  {/if}
</svg>

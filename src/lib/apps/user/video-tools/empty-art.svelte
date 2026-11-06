<script lang="ts">
  import { ArtArrow, ArtPhoto } from "$kit/components/tool-art";

  const OUTPUTS = ["WebM", "GIF", "Sound"];
</script>

<svg viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg" fill="none">
  <ArtPhoto x={10} y={8} width={100} height={60} />
  <circle cx="60" cy="38" r="11" class="fill-background-darker/80" />
  <path d="M56 32.5v11l9-5.5z" class="fill-foreground" />
  <rect x="10" y="78" width="100" height="6" rx="3" class="fill-foreground/12" />
  <rect x="38" y="78" width="40" height="6" class="fill-primary" />
  <rect x="35" y="73" width="4" height="16" rx="1.5" class="fill-primary" />
  <rect x="77" y="73" width="4" height="16" rx="1.5" class="fill-primary" />
  <ArtArrow x1={122} x2={148} />
  {#each OUTPUTS as output, index (output)}
    <rect x="160" y={14 + index * 26} width="66" height="20" rx="4" class={index === 1 ? "fill-primary/15 stroke-primary/60" : "fill-foreground/8"} />
    <text x="193" y={27.5 + index * 26} text-anchor="middle" font-size="9" class={index === 1 ? "fill-primary font-mono font-semibold" : "fill-foreground/80 font-mono"}>{output}</text>
  {/each}
</svg>

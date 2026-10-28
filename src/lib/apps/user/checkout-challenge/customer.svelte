<script lang="ts">
  import { Mood } from "./game";

  let { mood, look, ears, class: class_name = "" }: { mood: Mood; look: number; ears: number; class?: string } = $props();

  const TINTS = ["text-primary", "text-secondary", "text-tertiary"];
  const EARS = [
    ["M38 44 C30 20 32 4 39 4 C46 4 48 22 46 42", "M54 42 C52 22 54 4 61 4 C68 4 70 20 62 44"],
    ["M38 44 C30 20 32 4 39 4 C46 4 48 22 46 42", "M56 42 C62 30 74 22 84 26 C90 30 80 40 64 46"],
    ["M37 44 C30 30 32 16 39 16 C46 16 48 28 46 42", "M54 42 C52 28 54 16 61 16 C68 16 70 30 63 44"],
  ];
  const MOUTHS: Record<Mood, string> = {
    [Mood.WAITING]: "M43 79 Q50 84 57 79",
    [Mood.HAPPY]: "M39 76 Q50 90 61 76",
    [Mood.SAD]: "M41 85 Q50 76 59 85",
    [Mood.VEXED]: "M41 83 Q45 80 50 83 Q55 86 59 82",
  };
</script>

<svg viewBox="0 0 100 110" class="{TINTS[look % TINTS.length]} {class_name}" aria-hidden="true">
  <g fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    {#each EARS[ears % EARS.length] as ear (ear)}<path d={ear} />{/each}
    <circle cx="50" cy="70" r="30" />
  </g>
  <g class="fill-foreground stroke-foreground" stroke-width="3" stroke-linecap="round" fill-opacity="1">
    {#if mood === Mood.HAPPY}
      <path d="M36 64 Q40 59 44 64 M56 64 Q60 59 64 64" fill="none" />
    {:else if mood === Mood.SAD || mood === Mood.VEXED}
      <circle cx="40" cy="65" r="2.5" stroke="none" />
      <circle cx="60" cy="65" r="2.5" stroke="none" />
      <path d={mood === Mood.VEXED ? "M33 55 L45 61 M67 55 L55 61" : "M34 57 L44 60 M66 57 L56 60"} fill="none" />
    {:else}
      <circle cx="40" cy="64" r="3" stroke="none" />
      <circle cx="60" cy="64" r="3" stroke="none" />
    {/if}
    <path d={MOUTHS[mood]} fill="none" />
  </g>
  {#if mood === Mood.HAPPY}
    <g fill="currentColor" fill-opacity="0.45">
      <circle cx="32" cy="76" r="4" />
      <circle cx="68" cy="76" r="4" />
    </g>
  {/if}
</svg>

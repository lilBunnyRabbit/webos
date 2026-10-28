<script lang="ts">
  let { class: class_name = "" }: { class?: string } = $props();
</script>

<svg viewBox="0 0 100 120" class="text-info {class_name}" aria-hidden="true">
  <g fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 118 C18 94 32 84 50 84 C68 84 82 94 82 118" />
    <circle cx="50" cy="56" r="24" />
  </g>
  <g fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round">
    <path d="M24 38 C30 18 70 18 76 38 Z" fill-opacity="0.6" />
    <path d="M22 40 L78 40" stroke-linecap="round" />
    <path d="M50 96 l5 4 -2 6 h-6 l-2 -6 z" fill-opacity="0.6" stroke-width="2" />
  </g>
  <g class="fill-foreground stroke-foreground" stroke-width="3" stroke-linecap="round">
    <circle cx="41" cy="56" r="2.5" stroke="none" />
    <circle cx="59" cy="56" r="2.5" stroke="none" />
    <path d="M36 49 L45 51 M64 49 L55 51 M43 68 L57 68" fill="none" />
  </g>
</svg>

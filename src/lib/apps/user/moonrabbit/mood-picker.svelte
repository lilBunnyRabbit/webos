<script lang="ts">
  import { button } from "$lib/core/components/ui/variants";
  import { cn } from "$lib/core/utils";
  import { MOOD_ICONS } from "./icons";
  import { MOOD_LABELS, MOODS, type Mood } from "./mood";

  interface Props {
    value: number | undefined;
    onchange: (value: Mood | undefined) => void;
    label?: string;
    size?: "md" | "lg";
    class?: string;
  }

  let { value, onchange, label = "Mood", size = "md", class: class_name }: Props = $props();
</script>

<div role="group" aria-label={label} class={cn("flex items-center gap-1", class_name)}>
  {#each MOODS as mood (mood)}
    {@const Icon = MOOD_ICONS[mood]}
    {@const selected = value === mood}
    <button
      type="button"
      aria-pressed={selected}
      aria-label={MOOD_LABELS[mood]}
      title={MOOD_LABELS[mood]}
      class={button({
        variant: "quiet",
        icon: true,
        pressed: selected,
        class: cn("rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cottontail", size === "lg" ? "size-11 pointer-coarse:size-12 [&_svg]:size-7" : "size-8 pointer-coarse:size-11 [&_svg]:size-5 pointer-coarse:[&_svg]:size-6"),
      })}
      onclick={() => onchange(selected ? undefined : mood)}
    >
      <Icon weight={selected ? "fill" : "regular"} />
    </button>
  {/each}
</div>

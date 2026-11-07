<script lang="ts">
  import { Select } from "$lib/core/components/ui";
  import { star_label } from "./track";

  interface Option {
    value: string;
    label: string;
  }

  interface Props {
    /** Levels listed: 1 to `open`. */
    open: number;
    stars: (level: number) => number;
    value: string;
    onpick: (value: string) => void;
    name?: (level: number) => string;
    id?: (level: number) => string;
    /** Choices listed before the levels (Airport's Random). */
    before?: Option[];
    label?: string;
    class?: string;
  }

  let { open, stars, value, onpick, name = (level) => `Level ${level}`, id = String, before = [], label = "Level", class: class_name }: Props = $props();

  const options = $derived([
    ...before,
    ...Array.from({ length: open }, (_, i) => ({ value: id(i + 1), label: star_label(name(i + 1), stars(i + 1)) })),
  ]);
</script>

<Select class={class_name} size="sm" aria-label={label} {options} bind:value={() => value, onpick} />
